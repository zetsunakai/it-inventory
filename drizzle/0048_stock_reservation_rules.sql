-- Custom SQL migration file, put your code below! --
-- Reservasi stok (backlog R-07, PRD bagian 6.3 dan 6.4, mengikuti action_assign hmx-002): transfer
-- yang mengambil stok gudang memesan stok saat Konfirmasi dan Cek stok. Tersedia = saldo − dipesan.
-- Lot yang belum dipilih diambil dari lot terlama dulu (FIFO), dan pergerakannya dipecah per lot.
-- Reservasi dilepas saat Lepas reservasi, Kembali ke Draft, Batal, dan Validasi.
--
-- Transfer yang sudah dikonfirmasi sebelum migrasi ini belum memesan stok sampai Cek stok.

ALTER TABLE stock_balances
  ADD CONSTRAINT stock_balances_reserved_not_negative CHECK (reserved_qty >= 0);
--> statement-breakpoint
ALTER TABLE stock_moves
  ADD CONSTRAINT stock_moves_reserved_valid CHECK (reserved_qty >= 0 AND reserved_qty <= qty);
--> statement-breakpoint
DROP FUNCTION transfer_tracking_errors(uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfer_tracking_errors(
  p_transfer_id uuid, p_for_confirm boolean DEFAULT false
) RETURNS text[]
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
      -- Saat Konfirmasi, barang keluar dari gudang tanpa lot diisi reservasi (lot terlama dulu).
      AND NOT (p_for_confirm AND source_warehouse_id IS NOT NULL)
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
-- Stok cukup di lokasi asal (PRD bagian 6.4): saldo dikurangi qty yang dipesan transfer lain.
CREATE OR REPLACE FUNCTION transfer_stock_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH setting AS (
    SELECT coalesce(
      (SELECT (value #>> '{}')::boolean FROM system_settings
       WHERE key = 'inventory.allow_negative_stock'),
      false
    ) AS allow_negative
  ),
  needed AS (
    SELECT m.product_id, m.source_location_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m
    WHERE m.transfer_id = p_transfer_id
    GROUP BY m.product_id, m.source_location_id, m.lot_id
  )
  SELECT coalesce(array_agg(
    format(
      'Stok %s%s di %s tidak cukup: tersedia %s, dibutuhkan %s.',
      p.sku, coalesce(' lot ' || lot.name, ''), l.code,
      replace(trim_scale(coalesce(b.qty - b.reserved_qty, 0))::text, '.', ','),
      replace(trim_scale(n.qty)::text, '.', ',')
    ) ORDER BY p.sku, l.code, lot.name
  ), ARRAY[]::text[])
  FROM needed n
  CROSS JOIN setting
  JOIN products p ON p.id = n.product_id
  JOIN locations l ON l.id = n.source_location_id
  JOIN warehouses w ON w.id = l.warehouse_id
  LEFT JOIN lots lot ON lot.id = n.lot_id
  LEFT JOIN stock_balances b ON b.product_id = n.product_id AND b.location_id = n.source_location_id
    AND b.lot_id IS NOT DISTINCT FROM n.lot_id
  WHERE coalesce(b.qty - b.reserved_qty, 0) < n.qty AND (w.is_bonded OR NOT setting.allow_negative);
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfer_confirm_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  transfer transfers%ROWTYPE;
  errors text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id;
  IF NOT EXISTS (SELECT 1 FROM transfer_lines WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Transfer belum punya baris barang.'::text;
  END IF;
  IF transfer.scheduled_date IS NULL THEN
    errors := errors || 'Tanggal rencana wajib diisi sebelum konfirmasi.'::text;
  END IF;
  IF transfer.type IN ('scrap', 'adjustment') AND coalesce(btrim(transfer.reason), '') = '' THEN
    errors := errors || 'Alasan wajib diisi.'::text;
  END IF;
  errors := errors || transfer_tracking_errors(p_transfer_id, true)
    || transfer_line_errors(p_transfer_id);
  IF transfer.type = 'return' THEN
    errors := errors || return_errors(p_transfer_id);
  END IF;
  RETURN errors;
END;
$$;
--> statement-breakpoint
-- Pesan stok untuk transfer yang mengambil stok gudang. Pergerakan dengan lot (atau produk tanpa
-- pelacakan) memesan dari saldo lot itu; pergerakan produk berpelacakan tanpa lot memesan dari lot
-- terlama di lokasi asal dan dipecah per lot (dalam satuan stok), sisanya tetap tanpa lot. Gudang
-- non-berikat yang boleh stok negatif tidak dibatasi. Saldo dikunci dulu, jadi dua transfer yang
-- dipesan bersamaan tidak bisa memesan stok yang sama. Mengembalikan status ketersediaan.
CREATE OR REPLACE FUNCTION reserve_transfer(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  allow_negative boolean;
  move record;
  bal record;
  need numeric;
  take numeric;
  remaining numeric;
  assigned boolean;
  all_reserved boolean;
  any_reserved boolean;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  IF NOT transfer_needs_stock(p_transfer_id) THEN
    RETURN 'ready';
  END IF;
  SELECT coalesce((SELECT (value #>> '{}')::boolean FROM system_settings
    WHERE key = 'inventory.allow_negative_stock'), false) INTO allow_negative;

  PERFORM 1 FROM stock_balances b
  WHERE (b.product_id, b.location_id) IN (
    SELECT product_id, source_location_id FROM stock_moves WHERE transfer_id = p_transfer_id
  )
  ORDER BY b.id
  FOR UPDATE;
  PERFORM set_config('app.ledger_write', 'on', true);

  FOR move IN
    SELECT m.*, p.tracking, p.uom_id AS stock_uom_id, w.is_bonded
    FROM stock_moves m
    JOIN products p ON p.id = m.product_id
    JOIN locations l ON l.id = m.source_location_id
    JOIN warehouses w ON w.id = l.warehouse_id
    WHERE m.transfer_id = p_transfer_id AND m.reserved_qty < m.qty
    ORDER BY m.position, m.created_at
  LOOP
    need := move.qty - move.reserved_qty;
    IF NOT move.is_bonded AND allow_negative THEN
      CONTINUE;
    END IF;

    IF move.lot_id IS NOT NULL OR move.tracking = 'none' THEN
      SELECT * INTO bal FROM stock_balances
      WHERE product_id = move.product_id AND location_id = move.source_location_id
        AND lot_id IS NOT DISTINCT FROM move.lot_id;
      take := least(need, greatest(coalesce(bal.qty - bal.reserved_qty, 0), 0));
      IF take > 0 THEN
        UPDATE stock_balances SET reserved_qty = reserved_qty + take WHERE id = bal.id;
        UPDATE stock_moves SET reserved_qty = reserved_qty + take WHERE id = move.id;
      END IF;
      CONTINUE;
    END IF;

    -- Produk berpelacakan tanpa lot: lot terlama dulu.
    remaining := need;
    assigned := false;
    FOR bal IN
      SELECT b.* FROM stock_balances b JOIN lots l ON l.id = b.lot_id
      WHERE b.product_id = move.product_id AND b.location_id = move.source_location_id
        AND b.qty - b.reserved_qty > 0
      ORDER BY l.created_at, l.name
    LOOP
      EXIT WHEN remaining <= 0;
      take := least(remaining, bal.qty - bal.reserved_qty);
      UPDATE stock_balances SET reserved_qty = reserved_qty + take WHERE id = bal.id;
      IF NOT assigned THEN
        UPDATE stock_moves
        SET lot_id = bal.lot_id, input_qty = take, input_uom_id = move.stock_uom_id,
          reserved_qty = take
        WHERE id = move.id;
        assigned := true;
      ELSE
        INSERT INTO stock_moves (
          transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
          reserved_qty, source_location_id, destination_location_id
        )
        VALUES (
          move.transfer_id, move.line_id, move.product_id, bal.lot_id, move.position, take,
          move.stock_uom_id, take, move.source_location_id, move.destination_location_id
        );
      END IF;
      remaining := remaining - take;
    END LOOP;
    IF assigned AND remaining > 0 THEN
      INSERT INTO stock_moves (
        transfer_id, line_id, product_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        move.transfer_id, move.line_id, move.product_id, move.position, remaining,
        move.stock_uom_id, move.source_location_id, move.destination_location_id
      );
    END IF;
  END LOOP;
  PERFORM set_config('app.ledger_write', previous_flag, true);

  SELECT bool_and(m.reserved_qty >= m.qty OR (NOT w.is_bonded AND allow_negative)),
    bool_or(m.reserved_qty > 0 OR (NOT w.is_bonded AND allow_negative))
  INTO all_reserved, any_reserved
  FROM stock_moves m
  JOIN locations l ON l.id = m.source_location_id
  JOIN warehouses w ON w.id = l.warehouse_id
  WHERE m.transfer_id = p_transfer_id;
  RETURN CASE
    WHEN coalesce(all_reserved, true) THEN 'ready'
    WHEN any_reserved THEN 'partially_available'
    ELSE 'waiting'
  END;
END;
$$;
--> statement-breakpoint
-- Lepas semua reservasi transfer: saldo dipesan berkurang sebesar pesanan barisnya.
CREATE OR REPLACE FUNCTION unreserve_transfer(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_balances b
  SET reserved_qty = greatest(b.reserved_qty - r.qty, 0)
  FROM (
    SELECT product_id, source_location_id, lot_id, sum(reserved_qty) AS qty
    FROM stock_moves WHERE transfer_id = p_transfer_id AND reserved_qty > 0
    GROUP BY product_id, source_location_id, lot_id
  ) r
  WHERE b.product_id = r.product_id AND b.location_id = r.source_location_id
    AND b.lot_id IS NOT DISTINCT FROM r.lot_id;
  UPDATE stock_moves SET reserved_qty = 0 WHERE transfer_id = p_transfer_id AND reserved_qty > 0;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Konfirmasi: Draft → Siap (transfer masuk) atau pesan stok → Menunggu/Sebagian tersedia/Siap.
CREATE OR REPLACE FUNCTION confirm_transfer(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  errors text[];
  next_status text;
BEGIN
  PERFORM lock_transfer_in(p_transfer_id, ARRAY['draft'], 'Hanya transfer Draft yang bisa dikonfirmasi.');
  errors := transfer_confirm_errors(p_transfer_id);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  next_status := reserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, next_status);
  RETURN next_status;
END;
$$;
--> statement-breakpoint
-- Cek stok: pesan sisa stok yang belum dipesan, lalu perbarui status.
CREATE OR REPLACE FUNCTION check_transfer_availability(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  next_status text;
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['waiting', 'partially_available', 'ready'],
    'Stok hanya dicek untuk transfer yang sudah dikonfirmasi.'
  );
  next_status := reserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, next_status);
  RETURN next_status;
END;
$$;
--> statement-breakpoint
-- Lepas reservasi: status kembali Menunggu sampai Cek stok berikutnya.
CREATE OR REPLACE FUNCTION release_transfer_reservation(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['partially_available', 'ready'],
    'Hanya transfer yang sudah memesan stok yang bisa dilepas reservasinya.'
  );
  IF NOT transfer_needs_stock(p_transfer_id) THEN
    RAISE EXCEPTION 'Transfer ini tidak memesan stok.';
  END IF;
  PERFORM unreserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, 'waiting');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reset_transfer_to_draft(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['waiting', 'partially_available', 'ready'],
    'Hanya transfer yang sudah dikonfirmasi dan belum Selesai yang bisa dikembalikan ke Draft.'
  );
  PERFORM unreserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, 'draft');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cancel_transfer(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['draft', 'waiting', 'partially_available', 'ready'],
    'Transfer yang sudah Selesai atau Batal tidak bisa dibatalkan.'
  );
  PERFORM unreserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, 'cancelled');
END;
$$;
--> statement-breakpoint
DROP FUNCTION transfer_availability(uuid);
--> statement-breakpoint
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
  IF transfer.status::text IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Transfer % sudah %.', transfer.number,
      CASE transfer.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;

  -- Reservasi transfer ini dilepas dulu; stok dicek terhadap saldo dikurangi pesanan transfer
  -- lain (R-07).
  PERFORM unreserve_transfer(p_transfer_id);
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

  -- Qty selesai per baris permintaan (R-05): jumlah pergerakannya dalam satuan stok.
  UPDATE transfer_lines l
  SET done_qty = coalesce((SELECT sum(m.qty) FROM stock_moves m WHERE m.line_id = l.id), 0)
  WHERE l.transfer_id = p_transfer_id;

  UPDATE transfers
  SET status = 'done', done_at = effective_at, done_by = actor
  WHERE id = p_transfer_id;

  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
