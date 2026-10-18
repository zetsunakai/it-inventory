-- Custom SQL migration file, put your code below! --
-- Tautan baris stock move ↔ baris dokumen BC otomatis per produk (backlog M4-04, PRD 8.2): saat
-- transfer ditautkan ke dokumen, saat move baru dibuat di transfer bertaut, dan saat baris barang
-- ditambahkan ke dokumen. Move yang sudah Selesai tidak disentuh; baris dokumen yang sudah dipakai
-- move Selesai tidak bisa diganti produknya atau dihapus.

-- Baris dokumen untuk satu produk: seri terkecil.
CREATE OR REPLACE FUNCTION customs_line_for(p_document_id uuid, p_product_id uuid) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM customs_document_lines
  WHERE document_id = p_document_id AND product_id = p_product_id
  ORDER BY seq LIMIT 1;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_moves_customs_line_fill() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'done' AND (
    TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id OR NEW.customs_document_line_id IS NULL
  ) THEN
    NEW.customs_document_line_id := customs_line_for(
      (SELECT customs_document_id FROM transfers WHERE id = NEW.transfer_id), NEW.product_id
    );
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_moves_customs_line_fill
  BEFORE INSERT OR UPDATE OF product_id ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION stock_moves_customs_line_fill();
--> statement-breakpoint
-- Menggantikan versi 0078: dokumen diganti → move yang belum Selesai ditautkan ulang per produk.
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
    UPDATE stock_moves
    SET customs_document_line_id = customs_line_for(NEW.customs_document_id, product_id)
    WHERE transfer_id = NEW.id AND status <> 'done';
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
-- Baris barang baru di dokumen: move transfer bertaut dengan produk yang sama dan belum punya
-- tautan langsung ditautkan.
CREATE OR REPLACE FUNCTION customs_document_lines_link_moves() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE stock_moves m SET customs_document_line_id = NEW.id
  FROM transfers t
  WHERE t.id = m.transfer_id AND t.customs_document_id = NEW.document_id
    AND m.product_id = NEW.product_id AND m.customs_document_line_id IS NULL
    AND m.status <> 'done';
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_lines_link_moves
  AFTER INSERT OR UPDATE OF product_id ON customs_document_lines
  FOR EACH ROW EXECUTE FUNCTION customs_document_lines_link_moves();
--> statement-breakpoint
-- Baris barang yang dipakai move: move Selesai mengunci produknya; move yang belum Selesai
-- dilepas dulu (lalu ditautkan ulang ke baris lain yang cocok).
CREATE OR REPLACE FUNCTION customs_document_lines_release_moves() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line customs_document_lines%ROWTYPE := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.product_id = OLD.product_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM stock_moves WHERE customs_document_line_id = OLD.id AND status = 'done'
  ) THEN
    RAISE EXCEPTION 'Barang seri % sudah dipakai transfer Selesai; produknya tidak bisa diganti atau dihapus.',
      OLD.seq;
  END IF;
  UPDATE stock_moves SET customs_document_line_id = NULL
  WHERE customs_document_line_id = OLD.id AND status <> 'done';
  UPDATE stock_moves m
  SET customs_document_line_id = customs_line_for(OLD.document_id, m.product_id)
  FROM transfers t
  WHERE t.id = m.transfer_id AND t.customs_document_id = OLD.document_id
    AND m.customs_document_line_id IS NULL AND m.status <> 'done' AND m.product_id = OLD.product_id
    AND customs_line_for(OLD.document_id, m.product_id) IS DISTINCT FROM OLD.id;
  RETURN line;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_lines_release_moves
  BEFORE UPDATE OF product_id OR DELETE ON customs_document_lines
  FOR EACH ROW EXECUTE FUNCTION customs_document_lines_release_moves();
