-- Custom SQL migration file, put your code below! --
-- Tautan dokumen BC ↔ transfer (backlog M4-01, PRD bagian 8.2, keputusan 18/10/2026 di PRD 15.4).
-- Hanya penerimaan (gr) dan pengiriman (gi) yang memakai dokumen BC, mengikuti DOCUMENT_SOURCE_MAP
-- hmx: gr → BC 2.3 atau 4.0, gi → BC 2.5, 3.0, atau 4.1. Retur, pindah lokasi, antar gudang,
-- pemakaian & scrap, dan penyesuaian tidak bisa ditautkan. Satu dokumen boleh dipakai beberapa
-- transfer (parsial); satu transfer tepat satu dokumen (transfers.customs_document_id).

-- Jenis dokumen yang boleh per kode pergerakan. Sama dengan CUSTOMS_MOVEMENT_DOC_CODES di
-- src/modules/it-inventory/lib/customs.ts.
CREATE OR REPLACE FUNCTION customs_movement_doc_codes(p_code movement_code)
RETURNS customs_doc_code[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_code
    WHEN 'gr' THEN ARRAY['23', '40']
    WHEN 'gi' THEN ARRAY['25', '30', '41']
    ELSE ARRAY[]::text[]
  END::customs_doc_code[];
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_doc_title(p_doc_code customs_doc_code) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'BC ' || left(p_doc_code::text, 1) || '.' || substr(p_doc_code::text, 2);
$$;
--> statement-breakpoint
-- Dokumen tertaut harus jenis yang cocok untuk kode pergerakan transfer dan belum Batal. Diperiksa
-- setelah trigger lain mengisi movement_code. Bila dokumen diganti atau dilepas, tautan baris move
-- ke baris dokumen lama ikut dilepas.
CREATE OR REPLACE FUNCTION transfers_customs_link_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  doc customs_documents%ROWTYPE;
  allowed customs_doc_code[] := customs_movement_doc_codes(NEW.movement_code);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.customs_document_id IS DISTINCT FROM OLD.customs_document_id THEN
    IF OLD.status = 'done' AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Dokumen BC transfer % yang sudah Selesai tidak bisa diganti.', NEW.number;
    END IF;
    UPDATE stock_moves SET customs_document_line_id = NULL
    WHERE transfer_id = NEW.id AND customs_document_line_id IS NOT NULL
      AND customs_document_line_id NOT IN (
        SELECT id FROM customs_document_lines WHERE document_id = NEW.customs_document_id
      );
  END IF;
  IF NEW.customs_document_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO doc FROM customs_documents WHERE id = NEW.customs_document_id;
  IF cardinality(allowed) = 0 THEN
    RAISE EXCEPTION 'Transfer % tidak memakai dokumen BC; hanya penerimaan dan pengiriman yang ditautkan ke dokumen.',
      NEW.number;
  END IF;
  IF NOT doc.doc_code = ANY (allowed) THEN
    RAISE EXCEPTION 'Dokumen % tidak cocok untuk %; pilih %.',
      customs_doc_title(doc.doc_code),
      CASE NEW.movement_code WHEN 'gr' THEN 'penerimaan' ELSE 'pengiriman' END,
      (SELECT string_agg(customs_doc_title(code), ' atau ') FROM unnest(allowed) code);
  END IF;
  IF doc.status = 'cancelled' AND (TG_OP = 'INSERT' OR NEW.customs_document_id IS DISTINCT FROM OLD.customs_document_id) THEN
    RAISE EXCEPTION 'Dokumen BC % sudah Batal.', doc.aju_number;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_customs_link_check
  AFTER INSERT OR UPDATE OF customs_document_id, movement_code ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_customs_link_check();
--> statement-breakpoint
-- Baris move hanya boleh ditautkan ke baris dokumen milik dokumen transfernya, dengan produk sama.
CREATE OR REPLACE FUNCTION stock_moves_customs_link_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line customs_document_lines%ROWTYPE;
  transfer_doc uuid;
BEGIN
  IF NEW.customs_document_line_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO line FROM customs_document_lines WHERE id = NEW.customs_document_line_id;
  SELECT customs_document_id INTO transfer_doc FROM transfers WHERE id = NEW.transfer_id;
  IF transfer_doc IS DISTINCT FROM line.document_id THEN
    RAISE EXCEPTION 'Baris dokumen BC harus milik dokumen yang ditautkan ke transfernya.';
  END IF;
  IF line.product_id <> NEW.product_id THEN
    RAISE EXCEPTION 'Baris dokumen BC seri % bukan untuk produk yang sama.', line.seq;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_moves_customs_link_check
  AFTER INSERT OR UPDATE OF customs_document_line_id, product_id ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION stock_moves_customs_link_check();
--> statement-breakpoint
-- Transfer lanjutan (backorder) dari penerimaan/pengiriman parsial memakai dokumen BC yang sama.
CREATE OR REPLACE FUNCTION transfers_inherit_customs_document() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.backorder_of_id IS NOT NULL AND NEW.customs_document_id IS NULL THEN
    NEW.customs_document_id := (
      SELECT customs_document_id FROM transfers WHERE id = NEW.backorder_of_id
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_inherit_customs_document
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_inherit_customs_document();
