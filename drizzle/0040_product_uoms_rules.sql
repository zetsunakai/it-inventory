-- Custom SQL migration file, put your code below! --
-- Satuan khusus produk dan pembulatan (backlog R-03, PRD bagian 5.1). Satuan umum berlaku untuk
-- semua produk; satuan khusus (uoms.product_id) hanya untuk produk itu, mis. 1 BOX = 24 PCS.

ALTER TABLE uoms
  ADD CONSTRAINT uoms_rounding_positive CHECK (rounding > 0),
  -- Satuan acuan kategori selalu satuan umum.
  ADD CONSTRAINT uoms_reference_global CHECK (NOT is_reference OR product_id IS NULL);
--> statement-breakpoint
-- Kode, kategori, status acuan, dan produk tidak bisa diubah. Kode satuan khusus tidak boleh sama
-- dengan kode satuan umum (dan sebaliknya), supaya "BOX" selalu jelas maksudnya.
CREATE OR REPLACE FUNCTION uoms_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
      RAISE EXCEPTION 'Kode satuan tidak bisa diubah.';
    END IF;
    IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
      RAISE EXCEPTION 'Kategori satuan tidak bisa diubah.';
    END IF;
    IF NEW.is_reference IS DISTINCT FROM OLD.is_reference THEN
      RAISE EXCEPTION 'Satuan acuan tidak bisa diganti.';
    END IF;
    IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
      RAISE EXCEPTION 'Produk satuan khusus tidak bisa diubah.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NULL AND EXISTS (
    SELECT 1 FROM uoms WHERE code = NEW.code AND product_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Kode satuan % sudah dipakai sebagai satuan khusus produk.', NEW.code;
  END IF;
  IF NEW.product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM uoms WHERE code = NEW.code AND product_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Kode satuan % sudah dipakai satuan umum.', NEW.code;
  END IF;
  IF NEW.product_id IS NOT NULL AND (
    SELECT u.category_id FROM products p JOIN uoms u ON u.id = p.uom_id WHERE p.id = NEW.product_id
  ) IS DISTINCT FROM NEW.category_id THEN
    RAISE EXCEPTION 'Satuan khusus harus sekategori dengan satuan stok produknya.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER uoms_guard ON uoms;
--> statement-breakpoint
CREATE TRIGGER uoms_guard
  BEFORE INSERT OR UPDATE ON uoms
  FOR EACH ROW EXECUTE FUNCTION uoms_guard();
--> statement-breakpoint
-- Satuan stok produk selalu satuan umum (satuan khusus baru bisa dibuat setelah produknya ada).
CREATE OR REPLACE FUNCTION products_stock_uom_global() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT product_id FROM uoms WHERE id = NEW.uom_id) IS NOT NULL THEN
    RAISE EXCEPTION 'Satuan stok harus satuan umum, bukan satuan khusus produk.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_stock_uom_global
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION products_stock_uom_global();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_moves_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
  transfer transfers%ROWTYPE;
  move_src locations%ROWTYPE;
  move_dst locations%ROWTYPE;
  transfer_src locations%ROWTYPE;
  transfer_dst locations%ROWTYPE;
BEGIN
  SELECT * INTO product FROM products WHERE id = NEW.product_id;
  IF (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) AND NOT product.active THEN
    RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
  END IF;
  IF NEW.lot_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND product_id = NEW.product_id) THEN
    RAISE EXCEPTION 'Lot bukan milik produk %.', product.sku;
  END IF;
  -- Satuan khusus produk hanya untuk produknya sendiri (backlog R-03).
  IF EXISTS (
    SELECT 1 FROM uoms WHERE id = NEW.input_uom_id
      AND product_id IS NOT NULL AND product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Satuan % hanya untuk produk lain, tidak bisa dipakai untuk produk %.',
      (SELECT code FROM uoms WHERE id = NEW.input_uom_id), product.sku;
  END IF;
  NEW.qty := convert_qty(NEW.input_qty, NEW.input_uom_id, product.uom_id);

  SELECT * INTO transfer FROM transfers WHERE id = NEW.transfer_id;
  SELECT * INTO move_src FROM locations WHERE id = NEW.source_location_id;
  SELECT * INTO move_dst FROM locations WHERE id = NEW.destination_location_id;
  SELECT * INTO transfer_src FROM locations WHERE id = transfer.source_location_id;
  SELECT * INTO transfer_dst FROM locations WHERE id = transfer.destination_location_id;
  IF NOT (
    (transfer_src.warehouse_id IS NULL AND move_src.id = transfer_src.id)
    OR (transfer_src.warehouse_id IS NOT NULL AND move_src.warehouse_id = transfer_src.warehouse_id
        AND move_src.type = transfer_src.type)
  ) THEN
    RAISE EXCEPTION 'Lokasi asal baris % tidak sesuai lokasi asal transfer.', product.sku;
  END IF;
  IF NOT (
    (transfer_dst.warehouse_id IS NULL AND move_dst.id = transfer_dst.id)
    OR (transfer_dst.warehouse_id IS NOT NULL AND move_dst.warehouse_id = transfer_dst.warehouse_id
        AND move_dst.type = transfer_dst.type)
  ) THEN
    RAISE EXCEPTION 'Lokasi tujuan baris % tidak sesuai lokasi tujuan transfer.', product.sku;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.source_location_id <> OLD.source_location_id) AND NOT move_src.active THEN
    RAISE EXCEPTION 'Lokasi asal % sudah diarsipkan.', move_src.code;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.destination_location_id <> OLD.destination_location_id)
    AND NOT move_dst.active THEN
    RAISE EXCEPTION 'Lokasi tujuan % sudah diarsipkan.', move_dst.code;
  END IF;

  NEW.source_warehouse_id := move_src.warehouse_id;
  NEW.destination_warehouse_id := move_dst.warehouse_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Konversi qty antar satuan (PRD bagian 5.1 dan 6.4): hanya dalam kategori yang sama. Hasil
-- dibulatkan ke kelipatan pembulatan satuan tujuan (backlog R-03), lalu ke 4 desimal.
CREATE OR REPLACE FUNCTION convert_qty(p_qty numeric, p_from_uom uuid, p_to_uom uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  from_uom uoms%ROWTYPE;
  to_uom uoms%ROWTYPE;
BEGIN
  SELECT * INTO from_uom FROM uoms WHERE id = p_from_uom;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Satuan asal tidak ditemukan.';
  END IF;
  SELECT * INTO to_uom FROM uoms WHERE id = p_to_uom;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Satuan tujuan tidak ditemukan.';
  END IF;
  IF from_uom.category_id <> to_uom.category_id THEN
    RAISE EXCEPTION 'Konversi antar kategori satuan yang berbeda tidak diizinkan.';
  END IF;
  RETURN round(
    round(p_qty * from_uom.factor / to_uom.factor / to_uom.rounding) * to_uom.rounding, 4
  );
END;
$$;
