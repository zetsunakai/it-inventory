-- Custom SQL migration file, put your code below! --
-- Kategori produk bertingkat dan SKU otomatis (backlog R-01, PRD bagian 5.1).

ALTER TABLE product_categories
  -- "/" dipakai sebagai pemisah jalur kategori (product_category_paths, import produk).
  ADD CONSTRAINT product_categories_name_valid CHECK (btrim(name) <> '' AND position('/' in name) = 0),
  -- Prefix huruf besar/angka, boleh "-" atau "/" setelah karakter pertama, maks. 10 karakter.
  ADD CONSTRAINT product_categories_code_prefix_format CHECK (
    code_prefix IS NULL OR code_prefix ~ '^[A-Z0-9][A-Z0-9/-]{0,9}$'
  ),
  ADD CONSTRAINT product_categories_code_digits_range CHECK (code_digits BETWEEN 3 AND 10);
--> statement-breakpoint
-- Nama unik di antara kategori dengan induk yang sama (tanpa membedakan huruf besar/kecil).
CREATE UNIQUE INDEX product_categories_sibling_name_unique
  ON product_categories (parent_id, lower(btrim(name))) NULLS NOT DISTINCT;
--> statement-breakpoint
-- Prefix unik supaya dua kategori tidak membuat SKU yang sama.
CREATE UNIQUE INDEX product_categories_code_prefix_unique
  ON product_categories (code_prefix) WHERE code_prefix IS NOT NULL;
--> statement-breakpoint
-- Induk tidak boleh membentuk lingkaran, dan kategori arsip tidak bisa menjadi induk baru.
CREATE OR REPLACE FUNCTION product_categories_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ancestor uuid;
BEGIN
  IF NEW.parent_id IS NULL
    OR (TG_OP = 'UPDATE' AND NEW.parent_id IS NOT DISTINCT FROM OLD.parent_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Kategori produk tidak bisa menjadi induk dirinya sendiri.';
  END IF;
  IF NOT (SELECT active FROM product_categories WHERE id = NEW.parent_id) THEN
    RAISE EXCEPTION 'Kategori induk sudah diarsipkan.';
  END IF;

  ancestor := NEW.parent_id;
  WHILE ancestor IS NOT NULL LOOP
    IF ancestor = NEW.id THEN
      RAISE EXCEPTION 'Kategori induk tidak boleh berada di bawah kategori ini sendiri.';
    END IF;
    SELECT parent_id INTO ancestor FROM product_categories WHERE id = ancestor;
  END LOOP;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER product_categories_guard
  BEFORE INSERT OR UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION product_categories_guard();
--> statement-breakpoint
-- Jalur lengkap tiap kategori dari akarnya, misalnya "Bahan baku / Logam / Baut".
CREATE VIEW product_category_paths AS
WITH RECURSIVE tree AS (
  SELECT id, name AS path, 0 AS depth FROM product_categories WHERE parent_id IS NULL
  UNION ALL
  SELECT child.id, tree.path || ' / ' || child.name, tree.depth + 1
  FROM product_categories child
  JOIN tree ON child.parent_id = tree.id
)
SELECT id, path, depth FROM tree;
--> statement-breakpoint
-- SKU berikutnya untuk sebuah kategori: prefix + nomor urut kategori yang diisi nol sampai
-- code_digits (nomor yang lebih panjang tidak dipotong). next_number() mengunci baris urutannya
-- sampai transaksi selesai, jadi dua produk yang dibuat bersamaan mendapat nomor berbeda. Nomor
-- yang sudah dipakai SKU manual dilewati.
CREATE OR REPLACE FUNCTION next_product_sku(p_category_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  category product_categories%ROWTYPE;
  n integer;
  candidate text;
BEGIN
  SELECT * INTO category FROM product_categories WHERE id = p_category_id;
  IF category.code_prefix IS NULL THEN
    RAISE EXCEPTION 'SKU wajib diisi karena kategori produk % tidak punya prefix kode.',
      coalesce(category.name, '(kosong)');
  END IF;
  LOOP
    n := next_number('sku:' || p_category_id, '');
    candidate := category.code_prefix ||
      CASE WHEN length(n::text) >= category.code_digits THEN n::text
        ELSE lpad(n::text, category.code_digits, '0') END;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM products WHERE sku = candidate);
  END LOOP;
  RETURN candidate;
END;
$$;
--> statement-breakpoint
-- Produk: SKU kosong dibuat dari kategorinya, dan kategori arsip tidak bisa dipilih.
CREATE OR REPLACE FUNCTION products_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND btrim(coalesce(NEW.sku, '')) = '' THEN
    IF NEW.category_id IS NULL THEN
      RAISE EXCEPTION 'SKU wajib diisi bila kategori produk tidak dipilih.';
    END IF;
    NEW.sku := next_product_sku(NEW.category_id);
  END IF;
  IF NEW.category_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id)
    AND NOT (SELECT active FROM product_categories WHERE id = NEW.category_id) THEN
    RAISE EXCEPTION 'Kategori produk sudah diarsipkan.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_before_write
  BEFORE INSERT OR UPDATE OF category_id ON products
  FOR EACH ROW EXECUTE FUNCTION products_before_write();
--> statement-breakpoint
CREATE TRIGGER product_categories_set_updated_at
  BEFORE UPDATE ON product_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('product_categories');
