-- Custom SQL migration file, put your code below! --
-- Lokasi stok utama gudang (backlog I-07, stock_location hmx-002): lokasi internal aktif di gudang
-- itu. Gudang lama diisi lokasi internal teratas pertamanya. Lokasi stok utama tidak bisa
-- diarsipkan selama masih dipakai.
UPDATE warehouses w SET stock_location_id = (
  SELECT l.id FROM locations l
  WHERE l.warehouse_id = w.id AND l.type = 'internal' AND l.active AND l.parent_id IS NULL
  ORDER BY l.code LIMIT 1
)
WHERE stock_location_id IS NULL;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION warehouses_stock_location_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_location_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.stock_location_id IS DISTINCT FROM OLD.stock_location_id)
    AND NOT EXISTS (
      SELECT 1 FROM locations
      WHERE id = NEW.stock_location_id AND warehouse_id = NEW.id AND type = 'internal' AND active
    ) THEN
    RAISE EXCEPTION 'Lokasi stok utama harus lokasi internal aktif di gudang ini.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER warehouses_stock_location_guard
  BEFORE INSERT OR UPDATE OF stock_location_id ON warehouses
  FOR EACH ROW EXECUTE FUNCTION warehouses_stock_location_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION locations_stock_location_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  warehouse_code text;
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active AND NOT NEW.active THEN
    SELECT code INTO warehouse_code FROM warehouses WHERE stock_location_id = NEW.id;
    IF warehouse_code IS NOT NULL THEN
      RAISE EXCEPTION 'Lokasi % adalah lokasi stok utama gudang %. Ganti lokasi stok utamanya dulu.',
        NEW.code, warehouse_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER locations_stock_location_guard
  BEFORE UPDATE OF active ON locations
  FOR EACH ROW EXECUTE FUNCTION locations_stock_location_guard();
--> statement-breakpoint
-- Sama dengan versi 0088; produk tanpa stok memakai lokasi stok utama gudang bila sesi untuk
-- seluruh gudang.
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
      SELECT stock_location_id FROM warehouses WHERE id = v_count.warehouse_id
    ), (
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
