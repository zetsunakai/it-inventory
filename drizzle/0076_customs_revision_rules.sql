-- Custom SQL migration file, put your code below! --
-- Revisi dokumen BC Terdaftar (backlog M3-12, PRD bagian 7.5): versi lama disimpan sebagai
-- snapshot read-only beserta alasannya, dokumen naik versi dan kembali ke Draft untuk dikoreksi
-- lalu didaftarkan ulang. Nomor aju tidak berubah. Field yang berubah dibaca dengan
-- membandingkan snapshot satu versi dengan versi berikutnya.

-- Dokumen beserta semua bagiannya sebagai satu jsonb (kolom snake_case seperti tabelnya). Baris
-- barang membawa product code dan nama produk saat itu.
CREATE OR REPLACE FUNCTION customs_document_snapshot(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'document', to_jsonb(d),
    'parties', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.entity_type_code)
      FROM customs_document_parties p WHERE p.document_id = d.id), '[]'),
    'lines', coalesce((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'sku', pr.sku,
          'product_name', pr.name,
          'taxes', coalesce((
            SELECT jsonb_agg(to_jsonb(t) ORDER BY t.levy_type_code)
            FROM customs_line_taxes t WHERE t.line_id = l.id), '[]'))
        ORDER BY l.seq)
      FROM customs_document_lines l JOIN products pr ON pr.id = l.product_id
      WHERE l.document_id = d.id), '[]'),
    'attachments', coalesce((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.seq)
      FROM customs_attachments a WHERE a.document_id = d.id), '[]'),
    'packages', coalesce((
      SELECT jsonb_agg(to_jsonb(k) ORDER BY k.seq)
      FROM customs_packages k WHERE k.document_id = d.id), '[]'),
    'containers', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.seq)
      FROM customs_containers c WHERE c.document_id = d.id), '[]'),
    'transports', coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.seq)
      FROM customs_transports t WHERE t.document_id = d.id), '[]'))
  FROM customs_documents d WHERE d.id = p_id;
$$;
--> statement-breakpoint
-- Revisi: hanya dokumen Terdaftar, alasan wajib.
CREATE OR REPLACE FUNCTION revise_customs_document(p_id uuid, p_reason text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
BEGIN
  IF doc.status <> 'registered' THEN
    RAISE EXCEPTION 'Hanya dokumen Terdaftar yang bisa direvisi.';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan revisi wajib diisi.';
  END IF;
  INSERT INTO customs_document_revisions (document_id, version, snapshot, reason, created_by)
  VALUES (doc.id, doc.version, customs_document_snapshot(doc.id), btrim(p_reason),
    nullif(current_setting('app.user_id', true), '')::uuid);
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents
  SET version = doc.version + 1, status = 'draft', submitted_at = NULL, rejection_reason = NULL
  WHERE id = doc.id;
  PERFORM set_config('app.customs_status_write', '', true);
  PERFORM refresh_customs_document_status(doc.id);
  RETURN doc.version + 1;
END;
$$;
--> statement-breakpoint
-- Snapshot revisi tidak bisa diubah; dihapus hanya bersama dokumennya oleh proses yang
-- diizinkan (penanda app.customs_status_write).
CREATE OR REPLACE FUNCTION customs_document_revisions_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR NOT customs_status_write_enabled() THEN
    RAISE EXCEPTION 'Riwayat revisi dokumen BC tidak bisa diubah atau dihapus.';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_revisions_guard
  BEFORE UPDATE OR DELETE ON customs_document_revisions
  FOR EACH ROW EXECUTE FUNCTION customs_document_revisions_guard();
--> statement-breakpoint
SELECT enable_audit('customs_document_revisions');
