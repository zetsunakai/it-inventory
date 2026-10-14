-- Custom SQL migration file, put your code below! --
-- Kode pergerakan (backlog R-04, PRD bagian 6.2): diisi database dari jenis dan lokasi transfer,
-- disalin ke baris saat validasi, dan dipakai kartu stok serta laporan mutasi.

CREATE OR REPLACE FUNCTION transfers_set_movement_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.movement_code := transfer_movement_code(
    NEW.type, NEW.source_location_id, NEW.destination_location_id, NEW.return_of_id
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_set_movement_code
  BEFORE INSERT OR UPDATE OF type, source_location_id, destination_location_id, return_of_id
  ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_set_movement_code();
--> statement-breakpoint
ALTER TABLE stock_moves
  ADD CONSTRAINT stock_moves_done_has_code CHECK (status <> 'done' OR movement_code IS NOT NULL);
--> statement-breakpoint
-- Kontribusi setiap pergerakan Selesai ke saldo per gudang (PRD bagian 9.3): masuk ke gudang
-- dari luar gudang itu, atau keluar ke luar gudang itu. Perpindahan di dalam gudang yang sama
-- tidak dihitung. Kode adj_in/adj_out = penyesuaian (termasuk hasil opname); sama hasilnya dengan
-- aturan lama "dari/ke lokasi penyesuaian".
CREATE OR REPLACE FUNCTION warehouse_movements(p_until timestamptz)
RETURNS TABLE (
  product_id uuid, warehouse_id uuid, category inventory_category, done_at timestamptz,
  delta numeric, kind text
)
LANGUAGE sql STABLE AS $$
  SELECT m.product_id, m.destination_warehouse_id, m.category, m.done_at, m.qty,
    CASE WHEN m.movement_code IN ('adj_in', 'adj_out') THEN 'adjustment' ELSE 'in' END
  FROM stock_moves m
  WHERE m.status = 'done' AND m.done_at < p_until AND m.destination_warehouse_id IS NOT NULL
    AND m.source_warehouse_id IS DISTINCT FROM m.destination_warehouse_id
  UNION ALL
  SELECT m.product_id, m.source_warehouse_id, m.category, m.done_at, -m.qty,
    CASE WHEN m.movement_code IN ('adj_in', 'adj_out') THEN 'adjustment' ELSE 'out' END
  FROM stock_moves m
  WHERE m.status = 'done' AND m.done_at < p_until AND m.source_warehouse_id IS NOT NULL
    AND m.source_warehouse_id IS DISTINCT FROM m.destination_warehouse_id;
$$;
--> statement-breakpoint
-- Validasi transfer (M2-02, diperbarui R-02 dan R-04): lot/seri otomatis diisi dulu, lalu semua syarat
-- diperiksa sekaligus (transfer_validation_errors). Bila lolos, dalam transaksi yang sama: baris
-- menjadi Selesai beserta salinan kategori produk dan kode pergerakannya, saldo diperbarui, dan transfer dikunci.
-- p_done_at = tanggal efektif; kosong = sekarang.
CREATE OR REPLACE FUNCTION validate_transfer(p_transfer_id uuid, p_done_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  effective_at timestamptz := coalesce(p_done_at, now());
  errors text[];
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;
  IF transfer.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Transfer % sudah %.', transfer.number,
      CASE transfer.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;

  PERFORM assign_auto_lots(p_transfer_id);

  -- Saldo yang dipakai (asal, dan nomor seri di semua lokasi) dikunci dulu supaya dua validasi
  -- bersamaan tidak lolos berdua. Retur: transfer asal dikunci supaya dua retur dari transfer
  -- yang sama tidak divalidasi bersamaan.
  PERFORM 1
  FROM stock_balances b
  JOIN stock_moves m ON m.transfer_id = p_transfer_id AND m.product_id = b.product_id
    AND m.lot_id IS NOT DISTINCT FROM b.lot_id
    AND (m.source_location_id = b.location_id OR m.lot_id IS NOT NULL)
  ORDER BY b.id
  FOR UPDATE OF b;
  IF transfer.type = 'return' THEN
    PERFORM 1 FROM transfers WHERE id = transfer.return_of_id FOR UPDATE;
  END IF;

  errors := transfer_validation_errors(p_transfer_id, effective_at);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);

  UPDATE stock_moves m
  SET status = 'done', done_at = effective_at, category = p.category,
    movement_code = transfer.movement_code
  FROM products p
  WHERE m.transfer_id = p_transfer_id AND p.id = m.product_id;

  -- Saldo: keluar dari lokasi asal, masuk ke lokasi tujuan.
  INSERT INTO stock_balances AS b (product_id, location_id, lot_id, warehouse_id, qty)
  SELECT product_id, location_id, lot_id, warehouse_id, sum(delta)
  FROM (
    SELECT product_id, source_location_id AS location_id, lot_id,
      source_warehouse_id AS warehouse_id, -qty AS delta
    FROM stock_moves WHERE transfer_id = p_transfer_id
    UNION ALL
    SELECT product_id, destination_location_id, lot_id, destination_warehouse_id, qty
    FROM stock_moves WHERE transfer_id = p_transfer_id
  ) changes
  GROUP BY product_id, location_id, lot_id, warehouse_id
  ON CONFLICT ON CONSTRAINT stock_balances_product_location_lot_unique
  DO UPDATE SET qty = b.qty + EXCLUDED.qty, updated_at = now();

  UPDATE transfers
  SET status = 'done', done_at = effective_at, done_by = actor
  WHERE id = p_transfer_id;

  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
