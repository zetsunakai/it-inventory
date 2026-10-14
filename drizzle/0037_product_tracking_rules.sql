-- Custom SQL migration file, put your code below! --
-- Pelacakan produk per lot atau nomor seri (backlog R-02, PRD bagian 5.1 dan 6.4). Menggantikan
-- products.lot_required (dihapus di migrasi berikutnya, setelah datanya disalin di sini).

UPDATE products SET tracking = 'lot' WHERE lot_required;
--> statement-breakpoint
ALTER TABLE products
  ADD CONSTRAINT products_lot_prefix_format CHECK (
    lot_prefix IS NULL OR lot_prefix ~ '^[A-Z0-9][A-Z0-9/-]{0,9}$'
  ),
  ADD CONSTRAINT products_lot_digits_range CHECK (lot_digits BETWEEN 3 AND 10),
  ADD CONSTRAINT products_lot_prefix_needs_tracking CHECK (
    lot_prefix IS NULL OR tracking <> 'none'
  );
--> statement-breakpoint
-- Pelacakan tidak bisa diubah selama produk punya stok di gudang atau transaksi yang belum
-- selesai: lot di saldo dan di baris Draft/Siap mengikuti pelacakan yang lama.
CREATE OR REPLACE FUNCTION products_tracking_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tracking IS DISTINCT FROM OLD.tracking AND (
    EXISTS (
      SELECT 1 FROM stock_balances
      WHERE product_id = NEW.id AND warehouse_id IS NOT NULL AND qty <> 0
    )
    OR EXISTS (
      SELECT 1 FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
      WHERE m.product_id = NEW.id AND t.status IN ('draft', 'ready')
    )
  ) THEN
    RAISE EXCEPTION 'Pelacakan produk % tidak bisa diubah karena produk masih punya stok atau transaksi yang belum selesai.',
      NEW.sku;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER products_tracking_guard
  BEFORE UPDATE OF tracking ON products
  FOR EACH ROW EXECUTE FUNCTION products_tracking_guard();
--> statement-breakpoint
-- Nomor lot/seri berikutnya untuk produk: prefix + nomor urut produk, diisi nol sampai lot_digits
-- (nomor yang lebih panjang tidak dipotong). Nomor yang sudah dipakai lot lain dilewati.
CREATE OR REPLACE FUNCTION next_lot_name(p_product_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
  n integer;
  candidate text;
BEGIN
  SELECT * INTO product FROM products WHERE id = p_product_id;
  IF product.lot_prefix IS NULL THEN
    RAISE EXCEPTION 'Produk % tidak punya prefix nomor lot/seri otomatis.', product.sku;
  END IF;
  LOOP
    n := next_number('lot:' || p_product_id, '');
    candidate := product.lot_prefix ||
      CASE WHEN length(n::text) >= product.lot_digits THEN n::text
        ELSE lpad(n::text, product.lot_digits, '0') END;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM lots WHERE product_id = p_product_id AND name = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;
--> statement-breakpoint
-- Baris yang lot/serinya diisi otomatis saat validasi: barang masuk dari luar gudang (penerimaan
-- dari vendor, penyesuaian tambah) untuk produk berpelacakan yang punya prefix, dengan lot kosong.
CREATE OR REPLACE FUNCTION move_gets_auto_lot(p_move_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT m.lot_id IS NULL AND p.tracking <> 'none' AND p.lot_prefix IS NOT NULL
    AND t.type IN ('receipt', 'adjustment') AND m.source_warehouse_id IS NULL
    AND m.destination_warehouse_id IS NOT NULL
  FROM stock_moves m
  JOIN products p ON p.id = m.product_id
  JOIN transfers t ON t.id = m.transfer_id
  WHERE m.id = p_move_id;
$$;
--> statement-breakpoint
-- Isi lot/seri otomatis (dipanggil validate_transfer sebelum pemeriksaan, jadi bila validasi gagal
-- lot dan nomor urutnya ikut batal). Per lot: satu lot baru per baris. Per nomor seri: baris berqty
-- n dipecah jadi n baris berqty 1 dalam satuan stok, masing-masing dengan nomor seri baru. Qty yang
-- bukan bilangan bulat dibiarkan; transfer_tracking_errors() yang melaporkannya.
CREATE OR REPLACE FUNCTION assign_auto_lots(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  move record;
  i integer;
BEGIN
  FOR move IN
    SELECT m.*, p.tracking, p.uom_id AS stock_uom_id
    FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = p_transfer_id AND move_gets_auto_lot(m.id)
    ORDER BY m.position, m.created_at
  LOOP
    IF move.tracking = 'lot' THEN
      UPDATE stock_moves SET lot_id = new_lot(move.product_id) WHERE id = move.id;
      CONTINUE;
    END IF;
    IF move.qty <> trunc(move.qty) THEN
      CONTINUE;
    END IF;
    UPDATE stock_moves
    SET input_qty = 1, input_uom_id = move.stock_uom_id, lot_id = new_lot(move.product_id)
    WHERE id = move.id;
    FOR i IN 2..move.qty::integer LOOP
      INSERT INTO stock_moves (
        transfer_id, product_id, lot_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        move.transfer_id, move.product_id, new_lot(move.product_id), move.position, 1,
        move.stock_uom_id, move.source_location_id, move.destination_location_id
      );
    END LOOP;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION new_lot(p_product_id uuid) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO lots (product_id, name) VALUES (p_product_id, next_lot_name(p_product_id))
  RETURNING id;
$$;
--> statement-breakpoint
-- Kesalahan pelacakan di baris transfer (PRD bagian 6.4), dipakai "Tandai siap" dan validasi:
--   * produk berpelacakan wajib punya lot/seri, kecuali akan diisi otomatis saat validasi;
--   * nomor seri ber-qty 1 (dalam satuan stok); barang masuk otomatis ber-qty bilangan bulat;
--   * satu nomor seri hanya boleh ada satu di seluruh gudang setelah transfer ini Selesai.
CREATE OR REPLACE FUNCTION transfer_tracking_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH moves AS (
    SELECT m.*, p.sku, p.tracking, move_gets_auto_lot(m.id) AS auto_lot, l.name AS lot_name
    FROM stock_moves m
    JOIN products p ON p.id = m.product_id
    LEFT JOIN lots l ON l.id = m.lot_id
    WHERE m.transfer_id = p_transfer_id AND p.tracking <> 'none'
  ),
  missing AS (
    SELECT DISTINCT format('Produk %s wajib diisi %s.', sku,
      CASE tracking WHEN 'serial' THEN 'nomor seri' ELSE 'nomor lot' END) AS message, sku
    FROM moves WHERE lot_id IS NULL AND NOT auto_lot
  ),
  serial_qty AS (
    SELECT format('Nomor seri %s produk %s: qty harus 1.', lot_name, sku) AS message, sku
    FROM moves WHERE tracking = 'serial' AND lot_id IS NOT NULL AND qty <> 1
    UNION ALL
    SELECT DISTINCT format(
      'Qty produk %s harus bilangan bulat karena dilacak per nomor seri.', sku
    ), sku
    FROM moves WHERE tracking = 'serial' AND auto_lot AND qty <> trunc(qty)
  ),
  -- Saldo nomor seri di lokasi gudang setelah transfer ini: saldo sekarang + masuk − keluar.
  serial_after AS (
    SELECT mv.product_id, mv.lot_id, mv.sku, mv.lot_name,
      coalesce((
        SELECT sum(b.qty) FROM stock_balances b
        WHERE b.product_id = mv.product_id AND b.lot_id = mv.lot_id AND b.warehouse_id IS NOT NULL
      ), 0)
      + sum(CASE WHEN mv.destination_warehouse_id IS NOT NULL THEN mv.qty ELSE 0 END)
      - sum(CASE WHEN mv.source_warehouse_id IS NOT NULL THEN mv.qty ELSE 0 END) AS qty
    FROM moves mv
    WHERE mv.tracking = 'serial' AND mv.lot_id IS NOT NULL
    GROUP BY mv.product_id, mv.lot_id, mv.sku, mv.lot_name
    -- Baris ber-qty selain 1 sudah dilaporkan di serial_qty.
    HAVING bool_and(mv.qty = 1)
  ),
  duplicate AS (
    SELECT format('Nomor seri %s produk %s sudah ada di stok.', lot_name, sku) AS message, sku
    FROM serial_after WHERE qty > 1
  )
  SELECT coalesce(array_agg(message ORDER BY sku, message), ARRAY[]::text[])
  FROM (
    SELECT message, sku FROM missing
    UNION ALL SELECT message, sku FROM serial_qty
    UNION ALL SELECT message, sku FROM duplicate
  ) all_errors;
$$;
--> statement-breakpoint
-- Semua syarat validasi transfer, satu alasan per elemen (PRD bagian 6.3, 6.4, 8.4). Saldo yang
-- dipakai sudah dikunci validate_transfer() sebelum fungsi ini dipanggil.
CREATE OR REPLACE FUNCTION transfer_validation_errors(p_transfer_id uuid, p_effective_at timestamptz)
RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  errors text[] := ARRAY[]::text[];
  line record;
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id;

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
  IF (p_effective_at AT TIME ZONE 'Asia/Jakarta')::date > today THEN
    errors := errors || 'Tanggal efektif tidak boleh di masa depan.'::text;
  ELSIF (p_effective_at AT TIME ZONE 'Asia/Jakarta')::date < today AND NOT (
    actor IS NULL OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'manajer')
  ) THEN
    errors := errors || 'Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer.'::text;
  END IF;

  -- Periode tertutup (PRD bagian 6.4): tidak ada pergerakan baru bertanggal di periode itu.
  IF period_is_closed(p_effective_at) THEN
    errors := errors || format(
      'Periode %s sudah ditutup. Pilih tanggal efektif di periode yang masih terbuka.',
      to_char(p_effective_at AT TIME ZONE 'Asia/Jakarta', 'MM/YYYY')
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

  errors := errors || transfer_tracking_errors(p_transfer_id);
  errors := errors || transfer_stock_errors(p_transfer_id);
  IF transfer.type = 'return' THEN
    errors := errors || return_errors(p_transfer_id);
  END IF;
  errors := errors || customs_gate_errors(p_transfer_id);
  RETURN errors;
END;
$$;
--> statement-breakpoint
-- Validasi transfer (M2-02, diperbarui R-02): lot/seri otomatis diisi dulu, lalu semua syarat
-- diperiksa sekaligus (transfer_validation_errors). Bila lolos, dalam transaksi yang sama: baris
-- menjadi Selesai beserta salinan kategori produknya, saldo diperbarui, dan transfer dikunci.
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
