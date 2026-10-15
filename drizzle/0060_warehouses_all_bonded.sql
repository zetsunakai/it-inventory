-- Revisi master gudang (backlog RM-02): semua gudang adalah gudang berikat. Kolom is_bonded dan
-- kategori gudang dihapus, begitu juga pengaturan stok negatif untuk gudang non-berikat: stok di
-- lokasi gudang mana pun tidak pernah boleh minus.

-- Stok cukup di lokasi asal (PRD bagian 6.4): saldo dikurangi qty yang dipesan transfer lain.
-- Lokasi virtual (tanpa gudang) tidak dicek.
CREATE OR REPLACE FUNCTION transfer_stock_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH needed AS (
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
  JOIN products p ON p.id = n.product_id
  JOIN locations l ON l.id = n.source_location_id
  LEFT JOIN lots lot ON lot.id = n.lot_id
  LEFT JOIN stock_balances b ON b.product_id = n.product_id AND b.location_id = n.source_location_id
    AND b.lot_id IS NOT DISTINCT FROM n.lot_id
  WHERE l.warehouse_id IS NOT NULL AND coalesce(b.qty - b.reserved_qty, 0) < n.qty;
$$;
--> statement-breakpoint
-- Pesan stok untuk transfer yang mengambil stok gudang. Pergerakan dengan lot (atau produk tanpa
-- pelacakan) memesan dari saldo lot itu; pergerakan produk berpelacakan tanpa lot memesan dari lot
-- terlama di lokasi asal dan dipecah per lot (dalam satuan stok), sisanya tetap tanpa lot. Saldo
-- dikunci dulu, jadi dua transfer yang dipesan bersamaan tidak bisa memesan stok yang sama.
-- Mengembalikan status ketersediaan.
CREATE OR REPLACE FUNCTION reserve_transfer(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
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

  PERFORM 1 FROM stock_balances b
  WHERE (b.product_id, b.location_id) IN (
    SELECT product_id, source_location_id FROM stock_moves WHERE transfer_id = p_transfer_id
  )
  ORDER BY b.id
  FOR UPDATE;
  PERFORM set_config('app.ledger_write', 'on', true);

  FOR move IN
    SELECT m.*, p.tracking, p.uom_id AS stock_uom_id
    FROM stock_moves m
    JOIN products p ON p.id = m.product_id
    JOIN locations l ON l.id = m.source_location_id AND l.warehouse_id IS NOT NULL
    WHERE m.transfer_id = p_transfer_id AND m.reserved_qty < m.qty
    ORDER BY m.position, m.created_at
  LOOP
    need := move.qty - move.reserved_qty;

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

  SELECT bool_and(m.reserved_qty >= m.qty), bool_or(m.reserved_qty > 0)
  INTO all_reserved, any_reserved
  FROM stock_moves m
  JOIN locations l ON l.id = m.source_location_id AND l.warehouse_id IS NOT NULL
  WHERE m.transfer_id = p_transfer_id;
  RETURN CASE
    WHEN coalesce(all_reserved, true) THEN 'ready'
    WHEN any_reserved THEN 'partially_available'
    ELSE 'waiting'
  END;
END;
$$;
--> statement-breakpoint
DELETE FROM system_settings WHERE key = 'inventory.allow_negative_stock';--> statement-breakpoint
ALTER TABLE "warehouses" DROP COLUMN "is_bonded";--> statement-breakpoint
ALTER TABLE "warehouses" DROP COLUMN "category";
