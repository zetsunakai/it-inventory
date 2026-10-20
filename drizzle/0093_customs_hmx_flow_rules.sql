-- Custom SQL migration file, put your code below! --
-- Aturan dokumen BC ikut hmx-002 (backlog H-01, H-02; PRD 7.3–7.6, 8). Struktur tabelnya di
-- migrasi customs_hmx_flow.
--   - Status Draft → Submitted lewat submit_customs_document() (document_state.py hmx); Submitted
--     beserta semua bagian dan tautan transfernya terkunci, Draft boleh dihapus.
--   - Nomor urut IT/<kode>/<5 digit> per jenis dibuat saat insert; No. Aju diisi user.
--   - Transfer dipilih di dokumen (customs_document_transfers) sesuai DOCUMENT_SOURCE_MAP hmx,
--     hanya transfer Siap atau Selesai.
--   - Tanpa gerbang validasi transfer dan tanpa alokasi dokumen asal.
DROP FUNCTION customs_gate_errors(uuid);--> statement-breakpoint
DROP FUNCTION customs_gate_enabled();--> statement-breakpoint
DROP FUNCTION allocate_origin(uuid, jsonb);--> statement-breakpoint
DROP FUNCTION suggest_origin_allocations(uuid);--> statement-breakpoint
DROP FUNCTION customs_origin_errors(uuid);--> statement-breakpoint
DROP FUNCTION origin_allocations_before_write();--> statement-breakpoint
DROP FUNCTION origin_allocations_guard();--> statement-breakpoint
DROP FUNCTION customs_origin_doc_codes(customs_doc_code);--> statement-breakpoint
DROP FUNCTION customs_movement_doc_codes(movement_code);--> statement-breakpoint
DROP FUNCTION next_aju_number(customs_doc_code, text, date);--> statement-breakpoint
DROP FUNCTION customs_document_revisions_guard();--> statement-breakpoint
-- Kelengkapan dokumen kembali hanya aturan validasi (M3-03), tanpa alokasi asal.
DROP FUNCTION customs_document_errors(uuid);--> statement-breakpoint
ALTER FUNCTION customs_rule_errors(uuid) RENAME TO customs_document_errors;--> statement-breakpoint
-- Product code baris ikut produknya (versi M4-03 tanpa pembersihan alokasi asal).
CREATE OR REPLACE FUNCTION customs_document_lines_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id THEN
    SELECT * INTO product FROM products WHERE id = NEW.product_id;
    IF NOT product.active THEN
      RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
    END IF;
    IF NOT product.customs_ready THEN
      RAISE EXCEPTION 'Produk % belum siap dokumen BC: kode HS belum diisi.', product.sku;
    END IF;
    NEW.category := product.category;
    NEW.item_code := CASE WHEN TG_OP = 'INSERT' THEN coalesce(NEW.item_code, product.sku)
      ELSE product.sku END;
    NEW.hs_code := coalesce(NEW.hs_code, product.hs_code);
    NEW.description := coalesce(NEW.description, product.name);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_documents_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Dokumen BC baru selalu berstatus Draft.';
    END IF;
    IF coalesce(NEW.number, '') = '' THEN
      NEW.number := 'IT/' || NEW.doc_code || '/'
        || lpad(next_number('customs_document:' || NEW.doc_code, 'all')::text, 5, '0');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'submitted' AND NOT customs_status_write_enabled() THEN
      RAISE EXCEPTION 'Dokumen % sudah Submitted dan tidak dapat diubah atau dihapus.', OLD.number;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.doc_code <> OLD.doc_code THEN
    RAISE EXCEPTION 'Jenis dokumen BC tidak bisa diubah.';
  END IF;
  IF NEW.number <> OLD.number THEN
    RAISE EXCEPTION 'Nomor dokumen IT Inventory tidak bisa diubah.';
  END IF;
  IF NOT customs_status_write_enabled() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Gunakan tombol Submit untuk mengubah status dokumen.';
    END IF;
    IF OLD.status = 'submitted' THEN
      RAISE EXCEPTION 'Dokumen % sudah Submitted dan tidak dapat diubah atau dihapus.', OLD.number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_documents_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON customs_documents
  FOR EACH ROW EXECUTE FUNCTION customs_documents_before_write();
--> statement-breakpoint
-- Bagian dokumen (entitas, barang, lampiran, kemasan, peti kemas, pengangkutan, pungutan,
-- jaminan, bank devisa, tautan transfer) ikut terkunci bersama dokumen Submitted.
CREATE OR REPLACE FUNCTION customs_parts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  doc customs_documents%ROWTYPE;
BEGIN
  IF customs_status_write_enabled() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT * INTO doc FROM customs_documents WHERE id = (row_data ->> 'document_id')::uuid;
  IF FOUND AND doc.status = 'submitted' THEN
    RAISE EXCEPTION 'Dokumen % sudah Submitted dan tidak dapat diubah atau dihapus.', doc.number;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_attachments_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_attachments FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_bank_accounts_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_bank_accounts FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_containers_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_containers FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_document_lines_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_lines FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_document_parties_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_parties FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_document_taxes_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_taxes FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_guarantees_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_guarantees FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_packages_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_packages FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_transports_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_transports FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_document_transfers_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_transfers FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
-- Kode pergerakan transfer yang boleh dipilih per jenis dokumen (DOCUMENT_SOURCE_MAP hmx-002):
-- penerimaan gr, pengiriman gi, antar gudang itw_in/itw_out.
CREATE OR REPLACE FUNCTION customs_document_source_codes(p_doc_code customs_doc_code)
RETURNS movement_code[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_doc_code::text
    WHEN '16' THEN ARRAY['gr']
    WHEN '20' THEN ARRAY['gr']
    WHEN '23' THEN ARRAY['itw_in', 'itw_out', 'gr']
    WHEN '25' THEN ARRAY['gi']
    WHEN '27' THEN ARRAY['itw_in', 'itw_out', 'gr', 'gi']
    WHEN '261' THEN ARRAY['gi']
    WHEN '262' THEN ARRAY['gr']
    WHEN '28' THEN ARRAY['gi']
    WHEN '30' THEN ARRAY['gi']
    WHEN '33' THEN ARRAY['gr', 'gi']
    WHEN '331' THEN ARRAY['gi']
    WHEN '40' THEN ARRAY['itw_in', 'itw_out', 'gr']
    WHEN '41' THEN ARRAY['itw_in', 'itw_out', 'gi']
  END::movement_code[];
$$;
--> statement-breakpoint
-- Transfer yang dipilih harus sumber yang diizinkan jenis dokumennya dan berstatus Siap atau
-- Selesai (validate_inventory_transfer_selection hmx).
CREATE OR REPLACE FUNCTION customs_document_transfers_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE;
  transfer transfers%ROWTYPE;
BEGIN
  SELECT * INTO doc FROM customs_documents WHERE id = NEW.document_id;
  SELECT * INTO transfer FROM transfers WHERE id = NEW.transfer_id;
  IF NOT (transfer.movement_code = ANY (customs_document_source_codes(doc.doc_code)))
    OR transfer.status::text NOT IN ('ready', 'done') THEN
    RAISE EXCEPTION 'Dokumen % hanya dapat dikaitkan dengan sumber inventory yang diizinkan. Transfer tidak valid: % (%, %).',
      customs_doc_title(doc.doc_code), transfer.number, transfer.movement_code,
      CASE transfer.status::text WHEN 'ready' THEN 'Siap' WHEN 'done' THEN 'Selesai'
        ELSE transfer.status::text END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_transfers_check BEFORE INSERT OR UPDATE
  ON customs_document_transfers FOR EACH ROW EXECUTE FUNCTION customs_document_transfers_check();
--> statement-breakpoint
SELECT enable_audit('customs_document_transfers');
--> statement-breakpoint
-- Submit (submit_documents hmx): Draft → Submitted. Field wajib (doc_validation_rules) dan
-- Inventory Transfer Documents diperiksa; semua kekurangan dilaporkan sekaligus.
CREATE OR REPLACE FUNCTION submit_customs_document(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE := lock_customs_document(p_id);
  errors text[];
BEGIN
  IF doc.status = 'submitted' THEN
    RAISE EXCEPTION 'Dokumen % sudah Submitted dan tidak dapat diubah atau dihapus.', doc.number;
  END IF;
  errors := customs_document_errors(p_id);
  IF NOT EXISTS (SELECT 1 FROM customs_document_transfers WHERE document_id = p_id) THEN
    errors := errors || 'Inventory Transfer Documents wajib diisi.'::text;
  END IF;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION '%', array_to_string(errors, E'\n');
  END IF;
  PERFORM set_config('app.customs_status_write', 'on', true);
  UPDATE customs_documents SET status = 'submitted', submitted_at = now() WHERE id = p_id;
  PERFORM set_config('app.customs_status_write', '', true);
END;
$$;
--> statement-breakpoint
-- Duplikat (M3-13): Draft baru dengan nomor urut baru; No. Aju, nomor daftar, tautan transfer,
-- dan file lampiran tidak ikut.
CREATE OR REPLACE FUNCTION duplicate_customs_document(p_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  source customs_documents%ROWTYPE;
  new_id uuid;
  line record;
  new_line uuid;
BEGIN
  SELECT * INTO source FROM customs_documents WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumen BC tidak ditemukan.';
  END IF;

  INSERT INTO customs_documents (
    doc_code, customs_office_code, currency_code, ndpbm, cif_value, fob_value, freight_value,
    insurance_value, delivery_price, gross_weight, net_weight, signer_name, signer_position,
    signer_city, signed_date, details, notes)
  VALUES (
    source.doc_code, source.customs_office_code, source.currency_code, source.ndpbm,
    source.cif_value, source.fob_value, source.freight_value, source.insurance_value,
    source.delivery_price, source.gross_weight, source.net_weight, source.signer_name,
    source.signer_position, source.signer_city, source.signed_date, source.details, source.notes)
  RETURNING id INTO new_id;

  INSERT INTO customs_document_parties (
    document_id, entity_type_code, seq, partner_id, name, address, country_code,
    identity_type_code, identity_number, nib, permit_number, permit_date, details)
  SELECT new_id, entity_type_code, seq, partner_id, name, address, country_code,
    identity_type_code, identity_number, nib, permit_number, permit_date, details
  FROM customs_document_parties WHERE document_id = p_id;

  -- Produk yang sudah diarsipkan atau tidak punya kode HS lagi ditolak trigger baris barang.
  FOR line IN SELECT * FROM customs_document_lines WHERE document_id = p_id ORDER BY seq LOOP
    INSERT INTO customs_document_lines (
      document_id, seq, product_id, item_code, hs_code, description, brand, item_type, item_size,
      specification, qty, ceisa_unit_code, stock_qty, package_qty, package_type_code, net_weight,
      origin_country_code, unit_price, invoice_value, cif_value, fob_value, freight_value,
      insurance_value, delivery_price, customs_value, details, vd_entries)
    VALUES (
      new_id, line.seq, line.product_id, line.item_code, line.hs_code, line.description,
      line.brand, line.item_type, line.item_size, line.specification, line.qty,
      line.ceisa_unit_code, line.stock_qty, line.package_qty, line.package_type_code,
      line.net_weight, line.origin_country_code, line.unit_price, line.invoice_value,
      line.cif_value, line.fob_value, line.freight_value, line.insurance_value,
      line.delivery_price, line.customs_value, line.details, line.vd_entries)
    RETURNING id INTO new_line;
    INSERT INTO customs_attachments (document_id, line_id, seq, document_type_code, number, date,
      facility_code, permit, office_code)
    SELECT new_id, new_line, seq, document_type_code, number, date, facility_code, permit,
      office_code
    FROM customs_attachments WHERE line_id = line.id;
  END LOOP;

  INSERT INTO customs_attachments (document_id, seq, document_type_code, number, date,
    facility_code, permit, office_code)
  SELECT new_id, seq, document_type_code, number, date, facility_code, permit, office_code
  FROM customs_attachments WHERE document_id = p_id AND line_id IS NULL;
  INSERT INTO customs_packages (document_id, seq, qty, package_type_code, marks)
  SELECT new_id, seq, qty, package_type_code, marks FROM customs_packages WHERE document_id = p_id;
  INSERT INTO customs_containers (document_id, seq, number, size_code, type_code, load_type_code)
  SELECT new_id, seq, number, size_code, type_code, load_type_code
  FROM customs_containers WHERE document_id = p_id;
  INSERT INTO customs_transports (document_id, seq, transport_mode_code, name, voyage_number,
    flag_country_code)
  SELECT new_id, seq, transport_mode_code, name, voyage_number, flag_country_code
  FROM customs_transports WHERE document_id = p_id;
  INSERT INTO customs_document_taxes (document_id, seq, levy_type_code, rate, amount, status)
  SELECT new_id, seq, levy_type_code, rate, amount, status
  FROM customs_document_taxes WHERE document_id = p_id;
  INSERT INTO customs_guarantees (document_id, seq, type_code, number, date, value, due_date,
    guarantor, bpj_number, bpj_date)
  SELECT new_id, seq, type_code, number, date, value, due_date, guarantor, bpj_number, bpj_date
  FROM customs_guarantees WHERE document_id = p_id;
  INSERT INTO customs_bank_accounts (document_id, seq, bank_code, code)
  SELECT new_id, seq, bank_code, code FROM customs_bank_accounts WHERE document_id = p_id;

  RETURN new_id;
END;
$$;
--> statement-breakpoint
-- Sama dengan versi 0086, tanpa gerbang dokumen BC (H-02).
CREATE OR REPLACE FUNCTION transfer_validation_errors(p_transfer_id uuid, p_effective_at timestamptz)
RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  errors text[] := ARRAY[]::text[];
  line record;
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id;
  -- Transfer yang ditolak Manajer (I-03) harus kembali ke Draft dulu; alasan lain belum relevan.
  IF transfer.status::text = 'rejected' THEN
    RETURN ARRAY[format(
      'Transfer %s ditolak. Kembalikan ke Draft, perbaiki, lalu konfirmasi lagi.', transfer.number
    )];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM transfer_lines WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Transfer belum punya baris barang.'::text;
  ELSIF NOT EXISTS (SELECT 1 FROM stock_moves WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Belum ada qty yang selesai. Isi qty selesai minimal satu baris.'::text;
  END IF;
  errors := errors || transfer_line_errors(p_transfer_id);

  -- Akses gudang (PRD bagian 3). Tanpa app.user_id = dijalankan sistem.
  IF actor IS NOT NULL THEN
    FOR line IN
      SELECT DISTINCT w.code
      FROM stock_moves m
      JOIN warehouses w ON w.id IN (m.source_warehouse_id, m.destination_warehouse_id)
      WHERE m.transfer_id = p_transfer_id AND NOT can_access_warehouse(actor, w.id)
      ORDER BY w.code
    LOOP
      errors := errors || format('Anda tidak punya akses ke gudang %s.', line.code);
    END LOOP;
  END IF;

  -- Gudang yang sedang di-opname dibekukan (R-13).
  errors := errors || stock_count_freeze_errors(p_transfer_id);

  -- Tanggal efektif (PRD bagian 6.4).
  IF (p_effective_at AT TIME ZONE 'Asia/Jakarta')::date > today THEN
    errors := errors || 'Tanggal efektif tidak boleh di masa depan.'::text;
  ELSIF (p_effective_at AT TIME ZONE 'Asia/Jakarta')::date < today AND NOT (
    actor IS NULL OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'manajer')
  ) THEN
    errors := errors || 'Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer.'::text;
  END IF;

  -- Periode tertutup (PRD bagian 6.4): tidak ada pergerakan baru bertanggal di periode itu.
  IF period_is_closed(p_effective_at) THEN
    errors := errors || format(
      'Periode %s sudah ditutup. Pilih tanggal efektif di periode yang masih terbuka.',
      to_char(p_effective_at AT TIME ZONE 'Asia/Jakarta', 'MM/YYYY')
    );
  END IF;

  -- Scrap dan penyesuaian: alasan wajib dan harus disetujui Manajer (PRD bagian 6.2).
  IF transfer.type IN ('scrap', 'adjustment') THEN
    IF coalesce(btrim(transfer.reason), '') = '' THEN
      errors := errors || 'Alasan wajib diisi.'::text;
    END IF;
    IF transfer.approved_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = transfer.approved_by AND role IN ('manajer', 'administrator')
    ) THEN
      errors := errors || 'Belum disetujui Manajer.'::text;
    END IF;
  END IF;

  errors := errors || transfer_tracking_errors(p_transfer_id);
  errors := errors || transfer_stock_errors(p_transfer_id);
  IF transfer.type = 'return' THEN
    errors := errors || return_errors(p_transfer_id);
  END IF;
  -- Batas permintaan retur. Dua transfer retur dari permintaan yang sama tidak divalidasi bersamaan
  -- karena validate_transfer() mengunci transfer asalnya.
  errors := errors || return_request_transfer_errors(p_transfer_id);
  errors := errors || interwarehouse_transit_errors(p_transfer_id);
  RETURN errors;
END;
$$;
