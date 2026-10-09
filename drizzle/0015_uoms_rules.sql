-- Custom SQL migration file, put your code below! --
-- Aturan satuan dan konversi yang dipaksakan di database (PRD bagian 5.1, 6.4, 13.1).

ALTER TABLE uom_categories
  ADD CONSTRAINT uom_categories_text_not_blank CHECK (btrim(code) <> '' AND btrim(name) <> '');
--> statement-breakpoint
-- Faktor selalu positif, dan satuan acuan selalu berfaktor 1.
ALTER TABLE uoms
  ADD CONSTRAINT uoms_text_not_blank CHECK (btrim(code) <> '' AND btrim(name) <> ''),
  ADD CONSTRAINT uoms_factor_positive CHECK (factor > 0),
  ADD CONSTRAINT uoms_reference_factor_one CHECK (NOT is_reference OR factor = 1);
--> statement-breakpoint
-- Kode tidak bisa diubah. Kategori dan status acuan juga tidak: produk dan transaksi mengacu
-- ke satuan ini, dan memindah acuan berarti menghitung ulang semua faktor di kategorinya.
CREATE OR REPLACE FUNCTION uoms_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Kode satuan tidak bisa diubah.';
  END IF;
  IF NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    RAISE EXCEPTION 'Kategori satuan tidak bisa diubah.';
  END IF;
  IF NEW.is_reference IS DISTINCT FROM OLD.is_reference THEN
    RAISE EXCEPTION 'Satuan acuan tidak bisa diganti.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER uoms_guard
  BEFORE UPDATE ON uoms
  FOR EACH ROW EXECUTE FUNCTION uoms_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION uom_categories_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Kode kategori satuan tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER uom_categories_guard
  BEFORE UPDATE ON uom_categories
  FOR EACH ROW EXECUTE FUNCTION uom_categories_guard();
--> statement-breakpoint
-- Konversi qty antar satuan (PRD bagian 5.1 dan 6.4): hanya dalam kategori yang sama, hasil
-- dibulatkan ke 4 desimal (presisi qty). Dipakai oleh fungsi transaksi di M2.
CREATE OR REPLACE FUNCTION convert_qty(p_qty numeric, p_from_uom uuid, p_to_uom uuid)
RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  from_category uuid;
  from_factor numeric;
  to_category uuid;
  to_factor numeric;
BEGIN
  SELECT category_id, factor INTO from_category, from_factor FROM uoms WHERE id = p_from_uom;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Satuan asal tidak ditemukan.';
  END IF;
  SELECT category_id, factor INTO to_category, to_factor FROM uoms WHERE id = p_to_uom;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Satuan tujuan tidak ditemukan.';
  END IF;
  IF from_category <> to_category THEN
    RAISE EXCEPTION 'Konversi antar kategori satuan yang berbeda tidak diizinkan.';
  END IF;
  RETURN round(p_qty * from_factor / to_factor, 4);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER uom_categories_set_updated_at
  BEFORE UPDATE ON uom_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER uoms_set_updated_at
  BEFORE UPDATE ON uoms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('uom_categories');
--> statement-breakpoint
SELECT enable_audit('uoms');
