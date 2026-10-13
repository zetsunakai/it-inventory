-- Custom SQL migration file, put your code below! --
-- Tutup periode bulanan (backlog M2-10, PRD bagian 6.4, 9.3, 9.4, 13.3). Bulan = kalender WIB.

CREATE OR REPLACE FUNCTION period_start(p_year integer, p_month integer) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT make_timestamptz(p_year, p_month, 1, 0, 0, 0, 'Asia/Jakarta');
$$;
--> statement-breakpoint
-- Awal bulan berikutnya (WIB). Dihitung dari angka bulan, bukan "+ interval '1 month'" pada
-- timestamptz, yang memakai zona waktu sesi dan bisa meleset beberapa hari.
CREATE OR REPLACE FUNCTION period_end(p_year integer, p_month integer) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT period_start(p_year + p_month / 12, p_month % 12 + 1);
$$;
--> statement-breakpoint
-- Tanggal di periode tertutup: semua tanggal sebelum akhir periode terakhir yang ditutup
-- (periode ditutup berurutan, jadi bulan sebelumnya pasti sudah tertutup juga).
CREATE OR REPLACE FUNCTION period_is_closed(p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(p_at < max(period_end(year, month)), false) FROM inventory_periods;
$$;
--> statement-breakpoint
-- Kontribusi setiap pergerakan Selesai ke saldo per gudang (PRD bagian 9.3): masuk ke gudang
-- dari luar gudang itu, atau keluar ke luar gudang itu. Perpindahan di dalam gudang yang sama
-- tidak dihitung. Dari/ke lokasi penyesuaian = penyesuaian (termasuk hasil opname).
CREATE OR REPLACE FUNCTION warehouse_movements(p_until timestamptz)
RETURNS TABLE (
  product_id uuid, warehouse_id uuid, category inventory_category, done_at timestamptz,
  delta numeric, kind text
)
LANGUAGE sql STABLE AS $$
  SELECT m.product_id, m.destination_warehouse_id, m.category, m.done_at, m.qty,
    CASE WHEN src.type = 'adjustment' THEN 'adjustment' ELSE 'in' END
  FROM stock_moves m JOIN locations src ON src.id = m.source_location_id
  WHERE m.status = 'done' AND m.done_at < p_until AND m.destination_warehouse_id IS NOT NULL
    AND m.source_warehouse_id IS DISTINCT FROM m.destination_warehouse_id
  UNION ALL
  SELECT m.product_id, m.source_warehouse_id, m.category, m.done_at, -m.qty,
    CASE WHEN dst.type = 'adjustment' THEN 'adjustment' ELSE 'out' END
  FROM stock_moves m JOIN locations dst ON dst.id = m.destination_location_id
  WHERE m.status = 'done' AND m.done_at < p_until AND m.source_warehouse_id IS NOT NULL
    AND m.source_warehouse_id IS DISTINCT FROM m.destination_warehouse_id;
$$;
--> statement-breakpoint
-- Tutup periode: hitung dan simpan period_balances, lalu kunci periodenya. Periode ditutup
-- berurutan tanpa melompati bulan, sehingga saldo akhir bulan N selalu sama dengan saldo awal
-- bulan N+1.
CREATE OR REPLACE FUNCTION close_period(p_year integer, p_month integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  period_from timestamptz;
  period_until timestamptz;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  IF p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Bulan tidak valid.';
  END IF;
  IF actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Periode hanya bisa ditutup Manajer.';
  END IF;
  period_from := period_start(p_year, p_month);
  period_until := period_end(p_year, p_month);
  -- Kunci daftar periode supaya dua penutupan tidak berjalan bersamaan.
  LOCK TABLE inventory_periods IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM inventory_periods WHERE year = p_year AND month = p_month) THEN
    RAISE EXCEPTION 'Periode %/% sudah ditutup.', lpad(p_month::text, 2, '0'), p_year;
  END IF;
  IF period_until > now() THEN
    RAISE EXCEPTION 'Periode %/% belum berakhir.', lpad(p_month::text, 2, '0'), p_year;
  END IF;

  -- Berurutan: bulan sebelumnya harus sudah ditutup, kecuali belum ada pergerakan sama sekali
  -- sebelum periode ini (periode pertama).
  IF EXISTS (SELECT 1 FROM stock_moves WHERE status = 'done' AND done_at < period_from)
    AND NOT EXISTS (
      SELECT 1 FROM inventory_periods WHERE period_end(year, month) = period_from
    ) THEN
    RAISE EXCEPTION 'Tutup dulu periode %/%.',
      lpad((CASE p_month WHEN 1 THEN 12 ELSE p_month - 1 END)::text, 2, '0'),
      CASE p_month WHEN 1 THEN p_year - 1 ELSE p_year END;
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);
  INSERT INTO period_balances (
    year, month, product_id, warehouse_id, category,
    opening_qty, in_qty, out_qty, adjustment_qty, closing_qty
  )
  SELECT p_year, p_month, product_id, warehouse_id, category,
    coalesce(sum(delta) FILTER (WHERE done_at < period_from), 0),
    coalesce(sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'in'), 0),
    coalesce(-sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'out'), 0),
    coalesce(sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'adjustment'), 0),
    coalesce(sum(delta), 0)
  FROM warehouse_movements(period_until)
  GROUP BY product_id, warehouse_id, category
  HAVING sum(delta) FILTER (WHERE done_at < period_from) <> 0
    OR count(*) FILTER (WHERE done_at >= period_from) > 0;

  INSERT INTO inventory_periods (year, month, closed_by) VALUES (p_year, p_month, actor);
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Pengaman terakhir: baris pergerakan tidak bisa menjadi Selesai dengan tanggal di periode
-- tertutup, lewat jalur mana pun.
CREATE OR REPLACE FUNCTION stock_moves_period_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND NEW.done_at IS NOT NULL AND period_is_closed(NEW.done_at) THEN
    RAISE EXCEPTION 'Periode % sudah ditutup.',
      to_char(NEW.done_at AT TIME ZONE 'Asia/Jakarta', 'MM/YYYY');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_moves_period_guard
  BEFORE INSERT OR UPDATE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION stock_moves_period_guard();
--> statement-breakpoint
-- Periode dan saldonya hanya ditulis close_period(), dan tidak bisa dibuka kembali.
CREATE OR REPLACE FUNCTION period_tables_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' OR NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Periode hanya bisa ditutup lewat close_period() dan tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_periods_guard
  BEFORE INSERT OR UPDATE OR DELETE ON inventory_periods
  FOR EACH ROW EXECUTE FUNCTION period_tables_guard();
--> statement-breakpoint
CREATE TRIGGER period_balances_guard
  BEFORE INSERT OR UPDATE OR DELETE ON period_balances
  FOR EACH ROW EXECUTE FUNCTION period_tables_guard();
--> statement-breakpoint
SELECT enable_audit('inventory_periods', 'year');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_transfer(p_transfer_id uuid, p_done_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  effective_at timestamptz := coalesce(p_done_at, now());
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  errors text[] := ARRAY[]::text[];
  line record;
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

  IF NOT EXISTS (SELECT 1 FROM stock_moves WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Transfer belum punya baris barang.'::text;
  END IF;

  -- Akses gudang (PRD bagian 3). Tanpa app.user_id = dijalankan sistem.
  IF actor IS NOT NULL THEN
    FOR line IN
      SELECT DISTINCT w.code
      FROM stock_moves m
      JOIN warehouses w ON w.id IN (m.source_warehouse_id, m.destination_warehouse_id)
      WHERE m.transfer_id = p_transfer_id AND NOT can_access_warehouse(actor, w.id)
      ORDER BY w.code
    LOOP
      errors := errors || format('Anda tidak punya akses ke gudang %s.', line.code);
    END LOOP;
  END IF;

  -- Tanggal efektif (PRD bagian 6.4).
  IF (effective_at AT TIME ZONE 'Asia/Jakarta')::date > today THEN
    errors := errors || 'Tanggal efektif tidak boleh di masa depan.'::text;
  ELSIF (effective_at AT TIME ZONE 'Asia/Jakarta')::date < today AND NOT (
    actor IS NULL OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'manajer')
  ) THEN
    errors := errors || 'Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer.'::text;
  END IF;

  -- Periode tertutup (PRD bagian 6.4): tidak ada pergerakan baru bertanggal di periode itu.
  IF period_is_closed(effective_at) THEN
    errors := errors || format(
      'Periode %s sudah ditutup. Pilih tanggal efektif di periode yang masih terbuka.',
      to_char(effective_at AT TIME ZONE 'Asia/Jakarta', 'MM/YYYY')
    );
  END IF;

  -- Scrap dan penyesuaian: alasan wajib dan harus disetujui Manajer (PRD bagian 6.2).
  IF transfer.type IN ('scrap', 'adjustment') THEN
    IF coalesce(btrim(transfer.reason), '') = '' THEN
      errors := errors || 'Alasan wajib diisi.'::text;
    END IF;
    IF transfer.approved_at IS NULL OR NOT EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = transfer.approved_by AND role IN ('manajer', 'administrator')
    ) THEN
      errors := errors || 'Belum disetujui Manajer.'::text;
    END IF;
  END IF;

  -- Produk wajib lot (PRD bagian 6.4).
  FOR line IN
    SELECT DISTINCT p.sku
    FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = p_transfer_id AND p.lot_required AND m.lot_id IS NULL
    ORDER BY p.sku
  LOOP
    errors := errors || format('Produk %s wajib diisi nomor lot.', line.sku);
  END LOOP;

  -- Stok cukup di lokasi asal (PRD bagian 6.4), aturan di transfer_stock_errors(). Saldo yang
  -- dipakai dikunci dulu supaya dua validasi bersamaan tidak lolos berdua.
  PERFORM 1
  FROM stock_balances b
  JOIN stock_moves m ON m.transfer_id = p_transfer_id AND m.product_id = b.product_id
    AND m.source_location_id = b.location_id AND m.lot_id IS NOT DISTINCT FROM b.lot_id
  FOR UPDATE OF b;
  errors := errors || transfer_stock_errors(p_transfer_id);

  -- Retur: qty tidak melebihi qty asal dikurangi retur sebelumnya. Transfer asal dikunci supaya
  -- dua retur dari transfer yang sama tidak divalidasi bersamaan.
  IF transfer.type = 'return' THEN
    PERFORM 1 FROM transfers WHERE id = transfer.return_of_id FOR UPDATE;
    errors := errors || return_errors(p_transfer_id);
  END IF;

  errors := errors || customs_gate_errors(p_transfer_id);

  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);

  UPDATE stock_moves m
  SET status = 'done', done_at = effective_at, category = p.category
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
