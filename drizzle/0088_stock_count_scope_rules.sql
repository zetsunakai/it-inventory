-- Custom SQL migration file, put your code below! --
-- Lingkup dan isi awal stock opname (backlog I-04, stock_count hmx-002): produk tertentu, produk
-- tanpa stok ikut dihitung, dan qty hitung awal (kosong, 0, atau qty sistem). Semuanya hanya bisa
-- diubah selama Draft dan dipakai start_stock_count().
ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_initial_counted_check
  CHECK (initial_counted IN ('empty', 'zero', 'system'));
--> statement-breakpoint
SELECT enable_audit('stock_count_products');
--> statement-breakpoint
-- Produk termasuk lingkup sesi: kategori sesi (beserta sub-kategorinya) dan, bila diisi, daftar
-- produk tertentu.
CREATE OR REPLACE FUNCTION stock_count_covers_product(p_count_id uuid, p_product_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT (
    c.product_category_id IS NULL OR EXISTS (
      SELECT 1
      FROM products p
      JOIN product_category_paths pp ON pp.id = p.category_id
      JOIN product_category_paths root ON root.id = c.product_category_id
      WHERE p.id = p_product_id AND (pp.path = root.path OR pp.path LIKE root.path || ' / %')
    )
  ) AND (
    NOT EXISTS (SELECT 1 FROM stock_count_products WHERE stock_count_id = c.id)
    OR EXISTS (
      SELECT 1 FROM stock_count_products WHERE stock_count_id = c.id AND product_id = p_product_id
    )
  )
  FROM stock_counts c WHERE c.id = p_count_id;
$$;
--> statement-breakpoint
-- Daftar produk tertentu hanya berubah selama Draft.
CREATE OR REPLACE FUNCTION stock_count_products_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status::text FROM stock_counts
      WHERE id = coalesce(NEW.stock_count_id, OLD.stock_count_id)) <> 'draft' THEN
    RAISE EXCEPTION 'Lingkup sesi opname hanya bisa diubah selama Draft.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_count_products_guard
  BEFORE INSERT OR UPDATE OR DELETE ON stock_count_products
  FOR EACH ROW EXECUTE FUNCTION stock_count_products_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_counts_scope_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.include_zero_stock IS DISTINCT FROM OLD.include_zero_stock
    OR NEW.initial_counted IS DISTINCT FROM OLD.initial_counted)
    AND OLD.status::text <> 'draft' THEN
    RAISE EXCEPTION 'Lingkup sesi opname hanya bisa diubah selama Draft.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_counts_scope_guard
  BEFORE UPDATE ON stock_counts
  FOR EACH ROW EXECUTE FUNCTION stock_counts_scope_guard();
--> statement-breakpoint
-- Mulai hitung: gudang dikunci dulu supaya dua sesi tidak mulai bersamaan, lalu daftar hitung
-- diisi dari saldo di lingkup sesi dengan qty sistem saat ini. Produk tanpa stok (tanpa pelacakan,
-- aktif) ikut sebagai baris qty sistem 0 di lokasi sesi, atau lokasi internal teratas gudang bila
-- sesi untuk seluruh gudang. Qty hitung awal mengikuti pilihan sesi.
CREATE OR REPLACE FUNCTION start_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_count stock_counts%ROWTYPE;
  running text;
  anchor uuid;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  v_count := lock_stock_count_in(
    p_count_id, ARRAY['draft'], 'Hanya sesi opname Draft yang bisa mulai dihitung.'
  );
  PERFORM 1 FROM warehouses WHERE id = v_count.warehouse_id FOR UPDATE;
  SELECT number INTO running FROM stock_counts
  WHERE warehouse_id = v_count.warehouse_id AND id <> p_count_id
    AND status::text IN ('counting', 'counted', 'review')
  LIMIT 1;
  IF running IS NOT NULL THEN
    RAISE EXCEPTION 'Gudang % sudah punya stock opname berjalan: %. Selesaikan atau batalkan dulu.',
      (SELECT code FROM warehouses WHERE id = v_count.warehouse_id), running;
  END IF;

  IF v_count.include_zero_stock THEN
    anchor := coalesce(v_count.location_id, (
      SELECT l.id FROM locations l
      WHERE l.warehouse_id = v_count.warehouse_id AND l.type = 'internal' AND l.active
        AND l.parent_id IS NULL
      ORDER BY l.code LIMIT 1
    ));
    IF anchor IS NULL THEN
      RAISE EXCEPTION 'Gudang belum punya lokasi internal aktif untuk produk tanpa stok.';
    END IF;
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'counting'::text::stock_count_status, cut_off_at = now()
  WHERE id = p_count_id;
  INSERT INTO stock_count_lines (stock_count_id, product_id, location_id, lot_id, system_qty)
  SELECT p_count_id, b.product_id, b.location_id, b.lot_id, b.qty
  FROM stock_balances b
  WHERE b.qty <> 0 AND stock_count_covers(p_count_id, b.location_id)
    AND stock_count_covers_product(p_count_id, b.product_id);
  IF v_count.include_zero_stock THEN
    INSERT INTO stock_count_lines (stock_count_id, product_id, location_id, lot_id, system_qty)
    SELECT p_count_id, p.id, anchor, NULL, 0
    FROM products p
    WHERE p.active AND p.tracking = 'none'
      AND stock_count_covers_product(p_count_id, p.id)
      AND NOT EXISTS (
        SELECT 1 FROM stock_count_lines cl WHERE cl.stock_count_id = p_count_id AND cl.product_id = p.id
      );
  END IF;
  IF v_count.initial_counted <> 'empty' THEN
    UPDATE stock_count_lines
    SET counted_qty = CASE v_count.initial_counted WHEN 'zero' THEN 0 ELSE system_qty END
    WHERE stock_count_id = p_count_id;
  END IF;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
