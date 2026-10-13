-- Custom SQL migration file, put your code below! --
-- Retur (backlog M2-07, PRD bagian 6.2): kebalikan penerimaan/pengiriman yang sudah Selesai.
-- Arah, partner, dan status transfer asal sudah dicek trigger transfers_before_write (M2-01);
-- di sini batas qty-nya.

-- Daftar alasan baris retur tidak sah: produk/lot tidak ada di transfer asal, atau qty melebihi
-- qty asal dikurangi retur lain yang sudah Selesai. Dihitung dalam satuan stok per produk × lot.
CREATE OR REPLACE FUNCTION return_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH ret AS (
    SELECT id, return_of_id FROM transfers WHERE id = p_transfer_id AND type = 'return'
  ),
  origin AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN ret ON m.transfer_id = ret.return_of_id
    WHERE m.status = 'done'
    GROUP BY m.product_id, m.lot_id
  ),
  earlier AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m
    JOIN transfers t ON t.id = m.transfer_id
    JOIN ret ON t.return_of_id = ret.return_of_id AND t.id <> ret.id
    WHERE t.type = 'return' AND m.status = 'done'
    GROUP BY m.product_id, m.lot_id
  ),
  current_return AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN ret ON m.transfer_id = ret.id
    GROUP BY m.product_id, m.lot_id
  )
  SELECT coalesce(array_agg(
    CASE WHEN o.qty IS NULL
      THEN format('Produk %s%s tidak ada di transfer asal.', p.sku, coalesce(' lot ' || l.name, ''))
      ELSE format(
        'Qty retur %s%s melebihi sisa yang bisa diretur: %s.',
        p.sku, coalesce(' lot ' || l.name, ''),
        replace(trim_scale(greatest(o.qty - coalesce(e.qty, 0), 0))::text, '.', ',')
      )
    END ORDER BY p.sku, l.name
  ), ARRAY[]::text[])
  FROM current_return c
  JOIN products p ON p.id = c.product_id
  LEFT JOIN lots l ON l.id = c.lot_id
  LEFT JOIN origin o ON o.product_id = c.product_id AND o.lot_id IS NOT DISTINCT FROM c.lot_id
  LEFT JOIN earlier e ON e.product_id = c.product_id AND e.lot_id IS NOT DISTINCT FROM c.lot_id
  WHERE o.qty IS NULL OR c.qty > o.qty - coalesce(e.qty, 0);
$$;
--> statement-breakpoint
-- Sisa yang masih bisa diretur per produk × lot dari satu transfer asal (untuk membuat retur dan
-- menampilkan batasnya di form).
CREATE OR REPLACE FUNCTION returnable_lines(p_origin_id uuid)
RETURNS TABLE (product_id uuid, lot_id uuid, qty numeric)
LANGUAGE sql STABLE AS $$
  WITH origin AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m WHERE m.transfer_id = p_origin_id AND m.status = 'done'
    GROUP BY m.product_id, m.lot_id
  ),
  returned AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
    WHERE t.return_of_id = p_origin_id AND t.type = 'return' AND m.status = 'done'
    GROUP BY m.product_id, m.lot_id
  )
  SELECT o.product_id, o.lot_id, o.qty - coalesce(r.qty, 0)
  FROM origin o
  LEFT JOIN returned r ON r.product_id = o.product_id AND r.lot_id IS NOT DISTINCT FROM o.lot_id
  WHERE o.qty - coalesce(r.qty, 0) > 0;
$$;
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

  -- Scrap dan penyesuaian: alasan wajib dan harus disetujui Manajer (PRD bagian 6.2).
  IF transfer.type IN ('scrap', 'adjustment') THEN
    IF coalesce(btrim(transfer.reason), '') = '' THEN
      errors := errors || 'Alasan wajib diisi.'::text;
    END IF;
    IF transfer.approved_at IS NULL THEN
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
