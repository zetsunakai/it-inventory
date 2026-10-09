-- Custom SQL migration file, put your code below! --
-- Aturan produk yang dipaksakan di database (PRD bagian 5.1, 5.3, 6.4, 13.1).

ALTER TABLE products
  ADD CONSTRAINT products_text_not_blank CHECK (btrim(sku) <> '' AND btrim(name) <> ''),
  -- Kode HS 8 digit (BTKI).
  ADD CONSTRAINT products_hs_code_format CHECK (hs_code IS NULL OR hs_code ~ '^[0-9]{8}$'),
  -- Satuan CEISA dan faktornya selalu berpasangan.
  ADD CONSTRAINT products_ceisa_unit_with_factor CHECK (
    (ceisa_unit_code IS NULL) = (ceisa_factor IS NULL)
  ),
  ADD CONSTRAINT products_ceisa_factor_positive CHECK (ceisa_factor IS NULL OR ceisa_factor > 0),
  ADD CONSTRAINT products_net_weight_not_negative CHECK (net_weight IS NULL OR net_weight >= 0);
--> statement-breakpoint
-- SKU dan satuan stok tidak bisa diubah: qty di ledger (M2) tersimpan dalam satuan stok,
-- dan dokumen serta laporan mengacu ke SKU.
CREATE OR REPLACE FUNCTION products_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sku IS DISTINCT FROM OLD.sku THEN
    RAISE EXCEPTION 'SKU produk tidak bisa diubah.';
  END IF;
  IF NEW.uom_id IS DISTINCT FROM OLD.uom_id THEN
    RAISE EXCEPTION 'Satuan stok produk tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_guard
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_guard();
--> statement-breakpoint
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('products');
