-- Custom SQL migration file, put your code below! --
-- Alur status dokumen BC (backlog M3-11, PRD bagian 7.3):
--   Draft ⇄ Siap ajukan (otomatis: Siap ajukan bila lolos customs_document_errors(), kembali
--   Draft bila diubah dan tidak lengkap lagi) → Diajukan → Terdaftar (nomor dan tanggal daftar,
--   respon) atau Ditolak → Draft. Batal hanya Manajer/Administrator, sebelum Terdaftar.
-- Status hanya berubah lewat fungsi di bawah (penanda transaksi app.customs_status_write).
-- Dokumen Diajukan, Terdaftar, Ditolak, dan Batal beserta semua bagiannya dikunci trigger;
-- koreksi dokumen Terdaftar lewat revisi (M3-12).

CREATE OR REPLACE FUNCTION customs_status_write_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.customs_status_write', true), '') = 'on';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_document_locked(p_status customs_document_status)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_status IN ('submitted', 'registered', 'rejected', 'cancelled');
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_status_label(p_status customs_document_status) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_status
    WHEN 'draft' THEN 'Draft'
    WHEN 'ready' THEN 'Siap ajukan'
    WHEN 'submitted' THEN 'Diajukan'
    WHEN 'registered' THEN 'Terdaftar'
    WHEN 'rejected' THEN 'Ditolak'
    WHEN 'cancelled' THEN 'Batal'
  END;
$$;
--> statement-breakpoint
-- Menggantikan versi M3-02: ditambah penjaga status dan penguncian.
CREATE OR REPLACE FUNCTION customs_documents_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Dokumen BC baru selalu berstatus Draft.';
    END IF;
    NEW.aju_date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
    NEW.aju_number := next_aju_number(NEW.doc_code, NEW.customs_office_code, NEW.aju_date);
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status NOT IN ('draft', 'ready') AND NOT customs_status_write_enabled() THEN
      RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa dihapus.', OLD.aju_number,
        customs_status_label(OLD.status);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.doc_code <> OLD.doc_code THEN
    RAISE EXCEPTION 'Jenis dokumen BC tidak bisa diubah.';
  END IF;
  IF NEW.aju_number <> OLD.aju_number OR NEW.aju_date <> OLD.aju_date THEN
    RAISE EXCEPTION 'Nomor dan tanggal aju tidak bisa diubah.';
  END IF;
  IF NOT customs_status_write_enabled() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Status dokumen BC hanya berubah lewat Ajukan, Catat terdaftar, Catat ditolak, Kembali ke Draft, atau Batal.';
    END IF;
    IF customs_document_locked(OLD.status) THEN
      RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa diubah.', OLD.aju_number,
        customs_status_label(OLD.status);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER customs_documents_before_write ON customs_documents;
--> statement-breakpoint
CREATE TRIGGER customs_documents_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON customs_documents
  FOR EACH ROW EXECUTE FUNCTION customs_documents_before_write();
--> statement-breakpoint
-- Bagian dokumen (entitas, barang, pungutan, lampiran, kemasan, peti kemas, pengangkutan) ikut
-- terkunci bersama dokumennya. Dokumen yang sedang dihapus (cascade) sudah tidak terlihat.
CREATE OR REPLACE FUNCTION customs_parts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  doc customs_documents%ROWTYPE;
BEGIN
  IF customs_status_write_enabled() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_TABLE_NAME = 'customs_line_taxes' THEN
    SELECT d.* INTO doc FROM customs_documents d
    JOIN customs_document_lines l ON l.document_id = d.id
    WHERE l.id = (row_data ->> 'line_id')::uuid;
  ELSE
    SELECT * INTO doc FROM customs_documents WHERE id = (row_data ->> 'document_id')::uuid;
  END IF;
  IF FOUND AND customs_document_locked(doc.status) THEN
    RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa diubah.', doc.aju_number,
      customs_status_label(doc.status);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_parties_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_parties FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_document_lines_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_lines FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_line_taxes_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_line_taxes FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_attachments_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_attachments FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_packages_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_packages FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_containers_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_containers FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
CREATE TRIGGER customs_transports_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_transports FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();
--> statement-breakpoint
-- Kunci dokumen untuk perubahan status; galat bila tidak ada.
CREATE OR REPLACE FUNCTION lock_customs_document(p_id uuid) RETURNS customs_documents
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE;
BEGIN
  SELECT * INTO doc FROM customs_documents WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumen BC tidak ditemukan.';
  END IF;
  RETURN doc;
END;
$$;
--> statement-breakpoint
-- Draft ⇄ Siap ajukan sesuai kelengkapan. Dipanggil setiap kali dokumen disimpan.
CREATE OR REPLACE FUNCTION refresh_customs_document_status(p_id uuid)
RETURNS customs_document_status
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
  next_status customs_document_status;
BEGIN
  IF doc.status NOT IN ('draft', 'ready') THEN
    RETURN doc.status;
  END IF;
  next_status := CASE WHEN cardinality(customs_document_errors(p_id)) = 0
    THEN 'ready' ELSE 'draft' END;
  IF next_status <> doc.status THEN
    PERFORM set_config('app.customs_status_write', 'on', true);
    UPDATE customs_documents SET status = next_status WHERE id = p_id;
    PERFORM set_config('app.customs_status_write', '', true);
  END IF;
  RETURN next_status;
END;
$$;
--> statement-breakpoint
-- Ajukan: dokumen sudah diinput ke portal CEISA dan menunggu respon. Kelengkapan dicek ulang;
-- semua kekurangan dilaporkan sekaligus.
CREATE OR REPLACE FUNCTION submit_customs_document(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
  errors text[];
BEGIN
  IF doc.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Dokumen BC % sudah %.', doc.aju_number, customs_status_label(doc.status);
  END IF;
  errors := customs_document_errors(p_id);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(errors, E'\n');
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents
  SET status = 'submitted', submitted_at = now(), rejection_reason = NULL
  WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
END;
$$;
--> statement-breakpoint
-- Catat terdaftar: nomor dan tanggal daftar wajib, respon persetujuan opsional.
CREATE OR REPLACE FUNCTION register_customs_document(
  p_id uuid,
  p_registration_number text,
  p_registration_date date,
  p_response_code text DEFAULT NULL,
  p_response_number text DEFAULT NULL,
  p_response_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  errors text[] := ARRAY[]::text[];
BEGIN
  IF doc.status <> 'submitted' THEN
    RAISE EXCEPTION 'Hanya dokumen Diajukan yang bisa dicatat terdaftar.';
  END IF;
  IF coalesce(btrim(p_registration_number), '') = '' THEN
    errors := errors || 'Nomor daftar wajib diisi.'::text;
  END IF;
  IF p_registration_date IS NULL THEN
    errors := errors || 'Tanggal daftar wajib diisi.'::text;
  ELSIF p_registration_date > today THEN
    errors := errors || 'Tanggal daftar tidak boleh di masa depan.'::text;
  ELSIF p_registration_date < doc.aju_date THEN
    errors := errors || 'Tanggal daftar tidak boleh sebelum tanggal aju.'::text;
  END IF;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(errors, E'\n');
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents
  SET status = 'registered',
    registration_number = btrim(p_registration_number),
    registration_date = p_registration_date,
    response_code = nullif(btrim(p_response_code), ''),
    response_number = nullif(btrim(p_response_number), ''),
    response_date = p_response_date
  WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
END;
$$;
--> statement-breakpoint
-- Catat ditolak: respon penolakan Bea Cukai, alasan wajib.
CREATE OR REPLACE FUNCTION reject_customs_document(
  p_id uuid,
  p_reason text,
  p_response_code text DEFAULT NULL,
  p_response_number text DEFAULT NULL,
  p_response_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
BEGIN
  IF doc.status <> 'submitted' THEN
    RAISE EXCEPTION 'Hanya dokumen Diajukan yang bisa dicatat ditolak.';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents
  SET status = 'rejected',
    rejection_reason = btrim(p_reason),
    response_code = nullif(btrim(p_response_code), ''),
    response_number = nullif(btrim(p_response_number), ''),
    response_date = p_response_date
  WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
END;
$$;
--> statement-breakpoint
-- Dokumen Ditolak kembali ke Draft untuk diperbaiki (alasan penolakan tetap terlihat).
CREATE OR REPLACE FUNCTION reset_customs_document_to_draft(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
BEGIN
  IF doc.status <> 'rejected' THEN
    RAISE EXCEPTION 'Hanya dokumen Ditolak yang bisa dikembalikan ke Draft.';
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents
  SET status = 'draft', submitted_at = NULL, response_code = NULL, response_number = NULL,
    response_date = NULL
  WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
  PERFORM refresh_customs_document_status(p_id);
END;
$$;
--> statement-breakpoint
-- Batal: hanya Manajer atau Administrator (tanpa user = proses sistem), sebelum Terdaftar.
CREATE OR REPLACE FUNCTION cancel_customs_document(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
BEGIN
  IF actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Hanya Manajer yang bisa membatalkan dokumen BC.';
  END IF;
  IF doc.status IN ('registered', 'cancelled') THEN
    RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa dibatalkan.', doc.aju_number,
      customs_status_label(doc.status);
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents SET status = 'cancelled', cancelled_at = now() WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
END;
$$;
