-- Custom SQL migration file, put your code below! --
-- Alokasi dokumen asal (backlog M4-03, PRD bagian 8.5): setiap baris barang dokumen keluar (BC 2.5,
-- 3.0, 4.1) diambil dari satu atau lebih baris dokumen masuk yang Terdaftar (saldo asal). Pasangan:
-- BC 2.5 dan 3.0 dari BC 2.3 atau 4.0; BC 4.1 hanya dari BC 4.0 (barang asal TLDDP). Produk harus
-- sama, qty dalam satuan stok, dan alokasi tidak boleh melebihi sisa saldo asal. Alokasi lengkap
-- (sama dengan qty baris) menjadi syarat Siap ajukan, jadi dokumen keluar yang Terdaftar selalu
-- punya asal yang cukup saat gerbang memeriksanya.

-- Jenis dokumen asal yang boleh per jenis dokumen keluar. Sama dengan CUSTOMS_ORIGIN_DOC_CODES di
-- src/modules/it-inventory/lib/customs.ts.
CREATE OR REPLACE FUNCTION customs_origin_doc_codes(p_doc_code customs_doc_code)
RETURNS customs_doc_code[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_doc_code
    WHEN '25' THEN ARRAY['23', '40']
    WHEN '30' THEN ARRAY['23', '40']
    WHEN '41' THEN ARRAY['40']
    ELSE ARRAY[]::text[]
  END::customs_doc_code[];
$$;
--> statement-breakpoint
-- Saldo asal per baris dokumen masuk Terdaftar: qty masuk, sudah dialokasikan ke dokumen keluar yang
-- belum Batal, dan sisa.
CREATE OR REPLACE VIEW customs_origin_balances AS
SELECT l.id AS line_id, l.document_id, d.doc_code, d.aju_number, d.registration_number,
  d.registration_date, l.seq, l.product_id, coalesce(l.stock_qty, 0) AS qty_in,
  coalesce(a.allocated, 0) AS allocated,
  coalesce(l.stock_qty, 0) - coalesce(a.allocated, 0) AS remaining
FROM customs_document_lines l
JOIN customs_documents d ON d.id = l.document_id
LEFT JOIN LATERAL (
  SELECT sum(oa.qty) AS allocated
  FROM origin_allocations oa
  JOIN customs_document_lines ol ON ol.id = oa.out_line_id
  JOIN customs_documents od ON od.id = ol.document_id
  WHERE oa.origin_line_id = l.id AND od.status <> 'cancelled'
) a ON true
WHERE d.status = 'registered' AND customs_doc_direction(d.doc_code) = 'in';
--> statement-breakpoint
-- Aturan setiap baris alokasi. Baris asal dikunci dulu supaya dua dokumen keluar yang dialokasikan
-- bersamaan tidak melebihi sisa saldo yang sama.
CREATE OR REPLACE FUNCTION origin_allocations_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  out_line customs_document_lines%ROWTYPE;
  out_doc customs_documents%ROWTYPE;
  origin_line customs_document_lines%ROWTYPE;
  origin_doc customs_documents%ROWTYPE;
  used numeric;
BEGIN
  SELECT * INTO out_line FROM customs_document_lines WHERE id = NEW.out_line_id;
  SELECT * INTO out_doc FROM customs_documents WHERE id = out_line.document_id;
  SELECT * INTO origin_line FROM customs_document_lines WHERE id = NEW.origin_line_id FOR UPDATE;
  SELECT * INTO origin_doc FROM customs_documents WHERE id = origin_line.document_id;

  IF NOT origin_doc.doc_code = ANY (customs_origin_doc_codes(out_doc.doc_code)) THEN
    RAISE EXCEPTION '% tidak bisa mengambil asal dari %.',
      customs_doc_title(out_doc.doc_code), customs_doc_title(origin_doc.doc_code);
  END IF;
  IF origin_doc.status <> 'registered' THEN
    RAISE EXCEPTION 'Dokumen asal % belum Terdaftar.', origin_doc.aju_number;
  END IF;
  IF origin_line.product_id <> out_line.product_id THEN
    RAISE EXCEPTION 'Barang seri % dan asalnya (% seri %) bukan produk yang sama.',
      out_line.seq, origin_doc.aju_number, origin_line.seq;
  END IF;
  SELECT coalesce(sum(oa.qty), 0) INTO used
  FROM origin_allocations oa
  JOIN customs_document_lines ol ON ol.id = oa.out_line_id
  JOIN customs_documents od ON od.id = ol.document_id
  WHERE oa.origin_line_id = NEW.origin_line_id AND od.status <> 'cancelled'
    AND oa.id IS DISTINCT FROM NEW.id;
  IF used + NEW.qty > coalesce(origin_line.stock_qty, 0) THEN
    RAISE EXCEPTION 'Alokasi % melebihi sisa saldo asal % seri % (sisa %).',
      trim_scale(NEW.qty), origin_doc.aju_number, origin_line.seq,
      trim_scale(greatest(coalesce(origin_line.stock_qty, 0) - used, 0));
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER origin_allocations_before_write
  BEFORE INSERT OR UPDATE ON origin_allocations
  FOR EACH ROW EXECUTE FUNCTION origin_allocations_before_write();
--> statement-breakpoint
-- Alokasi ikut terkunci bersama dokumen keluarnya (Diajukan, Terdaftar, Ditolak, Batal).
CREATE OR REPLACE FUNCTION origin_allocations_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE;
BEGIN
  IF customs_status_write_enabled() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT d.* INTO doc FROM customs_documents d
  JOIN customs_document_lines l ON l.document_id = d.id
  WHERE l.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.out_line_id ELSE NEW.out_line_id END;
  IF FOUND AND customs_document_locked(doc.status) THEN
    RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa diubah.', doc.aju_number,
      customs_status_label(doc.status);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER origin_allocations_guard
  BEFORE INSERT OR UPDATE OR DELETE ON origin_allocations
  FOR EACH ROW EXECUTE FUNCTION origin_allocations_guard();
--> statement-breakpoint
CREATE TRIGGER origin_allocations_set_updated_at
  BEFORE UPDATE ON origin_allocations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('origin_allocations');
--> statement-breakpoint
-- Produk baris dokumen keluar diganti: alokasinya tidak berlaku lagi. Product code baris ikut
-- produk barunya (versi M3-01 hanya mengisi yang kosong).
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
    IF TG_OP = 'UPDATE' THEN
      DELETE FROM origin_allocations WHERE out_line_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Kelengkapan dokumen = aturan validasi (M3-03) + alokasi asal dokumen keluar.
ALTER FUNCTION customs_document_errors(uuid) RENAME TO customs_rule_errors;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_origin_errors(p_document_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(
    format('Barang seri %s: dokumen asal baru dialokasikan %s dari %s.',
      l.seq, trim_scale(coalesce(a.qty, 0)), trim_scale(coalesce(l.stock_qty, 0)))
    ORDER BY l.seq), ARRAY[]::text[])
  FROM customs_document_lines l
  JOIN customs_documents d ON d.id = l.document_id
  LEFT JOIN LATERAL (
    SELECT sum(qty) AS qty FROM origin_allocations WHERE out_line_id = l.id
  ) a ON true
  WHERE l.document_id = p_document_id
    AND cardinality(customs_origin_doc_codes(d.doc_code)) > 0
    AND coalesce(a.qty, 0) <> coalesce(l.stock_qty, 0);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_document_errors(p_document_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT customs_rule_errors(p_document_id) || customs_origin_errors(p_document_id);
$$;
--> statement-breakpoint
-- Saran alokasi FIFO untuk satu baris dokumen keluar: saldo asal produk yang sama, jenis yang
-- boleh, dokumen tertua dulu (tanggal daftar, nomor aju, seri), sampai qty baris terpenuhi.
-- Alokasi baris itu sendiri dianggap belum ada (saran pengganti, bisa diubah user).
CREATE OR REPLACE FUNCTION suggest_origin_allocations(p_out_line_id uuid)
RETURNS TABLE (origin_line_id uuid, qty numeric)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  out_line customs_document_lines%ROWTYPE;
  out_doc customs_documents%ROWTYPE;
  needed numeric;
  candidate record;
BEGIN
  SELECT * INTO out_line FROM customs_document_lines WHERE id = p_out_line_id;
  SELECT * INTO out_doc FROM customs_documents WHERE id = out_line.document_id;
  needed := coalesce(out_line.stock_qty, 0);
  FOR candidate IN
    SELECT b.line_id,
      b.remaining + coalesce((
        SELECT sum(oa.qty) FROM origin_allocations oa
        WHERE oa.origin_line_id = b.line_id AND oa.out_line_id = p_out_line_id
      ), 0) AS available
    FROM customs_origin_balances b
    WHERE b.product_id = out_line.product_id
      AND b.doc_code = ANY (customs_origin_doc_codes(out_doc.doc_code))
    ORDER BY b.registration_date, b.aju_number, b.seq
  LOOP
    EXIT WHEN needed <= 0;
    CONTINUE WHEN candidate.available <= 0;
    origin_line_id := candidate.line_id;
    qty := least(needed, candidate.available);
    needed := needed - qty;
    RETURN NEXT;
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Simpan alokasi satu baris dokumen keluar sekaligus (mengganti yang lama). p_allocations:
-- [{"origin_line_id": "...", "qty": "10"}, ...]. Total tidak boleh melebihi qty baris.
CREATE OR REPLACE FUNCTION allocate_origin(p_out_line_id uuid, p_allocations jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  out_line customs_document_lines%ROWTYPE;
  total numeric;
BEGIN
  SELECT * INTO out_line FROM customs_document_lines WHERE id = p_out_line_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris dokumen BC tidak ditemukan.';
  END IF;
  SELECT coalesce(sum((item ->> 'qty')::numeric), 0) INTO total
  FROM jsonb_array_elements(p_allocations) item;
  IF total > coalesce(out_line.stock_qty, 0) THEN
    RAISE EXCEPTION 'Total alokasi % melebihi qty barang seri % (%).',
      trim_scale(total), out_line.seq, trim_scale(coalesce(out_line.stock_qty, 0));
  END IF;
  DELETE FROM origin_allocations WHERE out_line_id = p_out_line_id;
  INSERT INTO origin_allocations (out_line_id, origin_line_id, qty)
  SELECT p_out_line_id, (item ->> 'origin_line_id')::uuid, sum((item ->> 'qty')::numeric)
  FROM jsonb_array_elements(p_allocations) item
  WHERE (item ->> 'qty')::numeric > 0
  GROUP BY (item ->> 'origin_line_id')::uuid;
END;
$$;
