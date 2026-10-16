-- Reservasi pengiriman mengikuti hmx-002 (backlog I-01, stock_balance.get_fifo_order dan
-- stock_demand._action_assign): Cek stok memesan dari lokasi asal beserta sub-lokasinya, stok yang
-- masuk paling awal dulu (FIFO tanggal masuk saldo, bukan tanggal lot dibuat). Pergerakan dipecah
-- per lot dan per lokasi tempat stok berada. Rincian lot pengiriman bisa diatur user
-- (set_delivery_line_moves) dari detail atau layar scan.

-- Tanggal masuk saldo: diisi saat saldo jadi positif (baru atau dari nol/minus).
ALTER TABLE stock_balances ADD COLUMN in_date timestamptz;
--> statement-breakpoint
SELECT set_config('app.ledger_write', 'on', true);
--> statement-breakpoint
UPDATE stock_balances b
SET in_date = coalesce((
  SELECT min(m.done_at) FROM stock_moves m
  WHERE m.status = 'done' AND m.product_id = b.product_id
    AND m.destination_location_id = b.location_id AND m.lot_id IS NOT DISTINCT FROM b.lot_id
), b.updated_at)
WHERE b.qty > 0;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_balances_in_date() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qty > 0 AND (TG_OP = 'INSERT' OR OLD.qty <= 0) THEN
    NEW.in_date := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_balances_in_date
  BEFORE INSERT OR UPDATE OF qty ON stock_balances
  FOR EACH ROW EXECUTE FUNCTION stock_balances_in_date();
--> statement-breakpoint
-- Lokasi ini dan semua sub-lokasinya yang aktif, di gudang dan bertipe sama (aturan pergerakan di
-- stock_moves_before_write).
CREATE OR REPLACE FUNCTION location_subtree(p_location_id uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE tree AS (
    SELECT l.id, l.warehouse_id, l.type FROM locations l WHERE l.id = p_location_id
    UNION ALL
    SELECT child.id, child.warehouse_id, child.type
    FROM locations child JOIN tree ON child.parent_id = tree.id
    WHERE child.active AND child.warehouse_id = tree.warehouse_id AND child.type = tree.type
  )
  SELECT id FROM tree;
$$;
--> statement-breakpoint
-- Pesan stok untuk transfer yang mengambil stok gudang. Setiap pergerakan yang belum dipesan mencari
-- saldo produknya (lot pergerakan bila sudah dipilih) di lokasi asal dan sub-lokasinya, kecuali
-- lokasi tujuan, urut tanggal masuk. Pergerakan pertama memakai saldo pertama; saldo berikutnya
-- jadi pergerakan baru; qty yang belum ada stoknya tetap sebagai pergerakan tanpa pesanan di lokasi
-- asal semula. Saldo produk di gudang itu dikunci dulu, jadi dua transfer yang dipesan bersamaan
-- tidak bisa memesan stok yang sama. Mengembalikan status ketersediaan.
CREATE OR REPLACE FUNCTION reserve_transfer(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  move record;
  bal record;
  take numeric;
  remaining numeric;
  first_chunk boolean;
  rest_id uuid;
  all_reserved boolean;
  any_reserved boolean;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  IF NOT transfer_needs_stock(p_transfer_id) THEN
    RETURN 'ready';
  END IF;

  PERFORM 1 FROM stock_balances b
  WHERE (b.product_id, b.warehouse_id) IN (
    SELECT m.product_id, m.source_warehouse_id FROM stock_moves m WHERE m.transfer_id = p_transfer_id
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
    -- Pesanan sebagian dari versi lama: bagian yang sudah dipesan dipisah dulu.
    IF move.reserved_qty > 0 THEN
      UPDATE stock_moves SET input_qty = move.reserved_qty, input_uom_id = move.stock_uom_id
      WHERE id = move.id;
      INSERT INTO stock_moves (
        transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        move.transfer_id, move.line_id, move.product_id, move.lot_id, move.position,
        move.qty - move.reserved_qty, move.stock_uom_id, move.source_location_id,
        move.destination_location_id
      )
      RETURNING id INTO rest_id;
      SELECT m.*, move.tracking AS tracking, move.stock_uom_id AS stock_uom_id
      INTO move FROM stock_moves m WHERE m.id = rest_id;
    END IF;

    remaining := move.qty;
    first_chunk := true;
    FOR bal IN
      SELECT b.* FROM stock_balances b
      JOIN locations l ON l.id = b.location_id
      LEFT JOIN lots lt ON lt.id = b.lot_id
      WHERE b.product_id = move.product_id
        AND b.location_id IN (SELECT location_subtree(move.source_location_id))
        AND b.location_id <> move.destination_location_id
        AND (CASE WHEN move.tracking = 'none' THEN b.lot_id IS NULL
                  ELSE b.lot_id IS NOT NULL AND (move.lot_id IS NULL OR b.lot_id = move.lot_id) END)
        AND b.qty - b.reserved_qty > 0
      ORDER BY b.in_date NULLS LAST, lt.created_at, l.code, lt.name
    LOOP
      EXIT WHEN remaining <= 0;
      take := least(remaining, bal.qty - bal.reserved_qty);
      UPDATE stock_balances SET reserved_qty = reserved_qty + take WHERE id = bal.id;
      IF first_chunk THEN
        IF take = move.qty AND bal.location_id = move.source_location_id
          AND bal.lot_id IS NOT DISTINCT FROM move.lot_id THEN
          UPDATE stock_moves SET reserved_qty = take WHERE id = move.id;
        ELSE
          UPDATE stock_moves
          SET lot_id = bal.lot_id, source_location_id = bal.location_id, input_qty = take,
            input_uom_id = move.stock_uom_id, reserved_qty = take
          WHERE id = move.id;
        END IF;
        first_chunk := false;
      ELSE
        INSERT INTO stock_moves (
          transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
          reserved_qty, source_location_id, destination_location_id
        )
        VALUES (
          move.transfer_id, move.line_id, move.product_id, bal.lot_id, move.position, take,
          move.stock_uom_id, take, bal.location_id, move.destination_location_id
        );
      END IF;
      remaining := remaining - take;
    END LOOP;
    IF NOT first_chunk AND remaining > 0 THEN
      INSERT INTO stock_moves (
        transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        move.transfer_id, move.line_id, move.product_id, move.lot_id, move.position, remaining,
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
-- Rincian lot pengiriman (I-01): user menentukan lot/nomor seri dan qty yang benar-benar dikirim per
-- baris. Pesanan baris itu dilepas, lalu setiap rincian dipesan dari lot itu di lokasi asal dan
-- sub-lokasinya (FIFO tanggal masuk). Qty selesai baris saat validasi = jumlah rinciannya.
-- p_moves: [{"lot": "LOT-A" | null, "qty": "4"}], qty dalam satuan stok. Semua kesalahan sekaligus.
CREATE OR REPLACE FUNCTION set_delivery_line_moves(p_line_id uuid, p_moves jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  line record;
  transfer transfers%ROWTYPE;
  item record;
  bal record;
  lot uuid;
  qty numeric;
  take numeric;
  remaining numeric;
  total numeric := 0;
  available numeric;
  errors text[] := ARRAY[]::text[];
  names text[] := ARRAY[]::text[];
  next_status text;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT l.*, p.sku, p.tracking, p.uom_id AS stock_uom_id
  INTO line
  FROM transfer_lines l JOIN products p ON p.id = l.product_id
  WHERE l.id = p_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris pengiriman tidak ditemukan.';
  END IF;
  SELECT * INTO transfer FROM transfers WHERE id = line.transfer_id FOR UPDATE;
  IF transfer.type <> 'delivery' THEN
    RAISE EXCEPTION 'Rincian lot ini hanya untuk pengiriman.';
  END IF;
  IF transfer.status::text NOT IN ('waiting', 'partially_available', 'ready') THEN
    RAISE EXCEPTION 'Rincian lot hanya bisa diubah setelah pengiriman dikonfirmasi dan sebelum Selesai.';
  END IF;
  IF jsonb_typeof(p_moves) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Rincian lot tidak terbaca. Muat ulang halaman.';
  END IF;

  PERFORM 1 FROM stock_balances b
  WHERE b.product_id = line.product_id
    AND b.location_id IN (SELECT location_subtree(transfer.source_location_id))
  ORDER BY b.id
  FOR UPDATE;
  PERFORM set_config('app.ledger_write', 'on', true);

  -- Pesanan baris ini dilepas dulu supaya stoknya bisa dipakai lagi oleh rincian baru.
  UPDATE stock_balances b
  SET reserved_qty = greatest(b.reserved_qty - r.qty, 0)
  FROM (
    SELECT product_id, source_location_id, lot_id, sum(reserved_qty) AS qty
    FROM stock_moves WHERE line_id = p_line_id AND reserved_qty > 0
    GROUP BY product_id, source_location_id, lot_id
  ) r
  WHERE b.product_id = r.product_id AND b.location_id = r.source_location_id
    AND b.lot_id IS NOT DISTINCT FROM r.lot_id;
  DELETE FROM stock_moves WHERE line_id = p_line_id;

  FOR item IN
    SELECT ordinality AS n, nullif(trim(value ->> 'lot'), '') AS lot_name, value ->> 'qty' AS qty_text
    FROM jsonb_array_elements(p_moves) WITH ORDINALITY
  LOOP
    DECLARE
      item_label text := coalesce(item.lot_name, format('Rincian %s', item.n));
    BEGIN
      BEGIN
        qty := item.qty_text::numeric;
      EXCEPTION WHEN invalid_text_representation THEN
        errors := errors || format('%s: qty bukan angka.', item_label);
        CONTINUE;
      END;
      IF qty IS NULL OR qty <= 0 OR scale(qty) > 4 THEN
        errors := errors || format('%s: qty harus lebih dari 0, maksimal 4 desimal.', item_label);
        CONTINUE;
      END IF;
      total := total + qty;
      lot := NULL;
      IF line.tracking = 'none' THEN
        IF item.lot_name IS NOT NULL THEN
          errors := errors || format('Produk %s tidak dilacak per lot atau nomor seri.', line.sku);
          CONTINUE;
        END IF;
      ELSE
        IF item.lot_name IS NULL THEN
          errors := errors || format('%s: isi %s produk %s.', item_label,
            CASE line.tracking WHEN 'serial' THEN 'nomor seri' ELSE 'nomor lot' END, line.sku);
          CONTINUE;
        END IF;
        IF item.lot_name = ANY (names) THEN
          errors := errors || format('%s %s tercatat dua kali.',
            CASE line.tracking WHEN 'serial' THEN 'Nomor seri' ELSE 'Lot' END, item.lot_name);
          CONTINUE;
        END IF;
        names := names || item.lot_name;
        IF line.tracking = 'serial' AND qty <> 1 THEN
          errors := errors || format('Nomor seri %s: qty harus 1.', item.lot_name);
          CONTINUE;
        END IF;
        SELECT id INTO lot FROM lots WHERE product_id = line.product_id AND name = item.lot_name;
        IF lot IS NULL THEN
          errors := errors || format('Lot %s tidak ada untuk produk %s.', item.lot_name, line.sku);
          CONTINUE;
        END IF;
      END IF;

      SELECT coalesce(sum(b.qty - b.reserved_qty), 0) INTO available
      FROM stock_balances b
      WHERE b.product_id = line.product_id AND b.lot_id IS NOT DISTINCT FROM lot
        AND b.location_id IN (SELECT location_subtree(transfer.source_location_id))
        AND b.qty - b.reserved_qty > 0;
      IF available < qty THEN
        errors := errors || format('%s: stok tersedia %s, dikirim %s.', item_label,
          replace(trim_scale(available)::text, '.', ','), replace(trim_scale(qty)::text, '.', ','));
        CONTINUE;
      END IF;

      remaining := qty;
      FOR bal IN
        SELECT b.* FROM stock_balances b
        JOIN locations l ON l.id = b.location_id
        WHERE b.product_id = line.product_id AND b.lot_id IS NOT DISTINCT FROM lot
          AND b.location_id IN (SELECT location_subtree(transfer.source_location_id))
          AND b.qty - b.reserved_qty > 0
        ORDER BY b.in_date NULLS LAST, l.code
      LOOP
        EXIT WHEN remaining <= 0;
        take := least(remaining, bal.qty - bal.reserved_qty);
        UPDATE stock_balances SET reserved_qty = reserved_qty + take WHERE id = bal.id;
        INSERT INTO stock_moves (
          transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
          reserved_qty, source_location_id, destination_location_id
        )
        VALUES (
          line.transfer_id, p_line_id, line.product_id, lot, line.position, take,
          line.stock_uom_id, take, bal.location_id, transfer.destination_location_id
        );
        remaining := remaining - take;
      END LOOP;
    END;
  END LOOP;
  IF total > line.qty THEN
    errors := errors || format('Qty dikirim %s melebihi qty diminta %s.',
      replace(trim_scale(total)::text, '.', ','), replace(trim_scale(line.qty)::text, '.', ','));
  END IF;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  PERFORM set_config('app.ledger_write', previous_flag, true);

  -- Status dihitung ulang dari pesanan semua baris.
  SELECT CASE
    WHEN coalesce(bool_and(m.reserved_qty >= m.qty), true) THEN 'ready'
    WHEN bool_or(m.reserved_qty > 0) THEN 'partially_available'
    ELSE 'waiting'
  END INTO next_status
  FROM stock_moves m WHERE m.transfer_id = line.transfer_id;
  PERFORM set_transfer_status(line.transfer_id, next_status);
END;
$$;
--> statement-breakpoint
-- Qty selesai baris yang pergerakannya dipecah dalam satuan stok dibandingkan dalam satuan stok.
CREATE OR REPLACE FUNCTION split_backorder(
  p_transfer_id uuid, p_done jsonb, p_create_backorder boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  transfer transfers%ROWTYPE;
  line record;
  done numeric;
  done_limit numeric;
  rest numeric;
  backorder_id uuid;
  backorder_line uuid;
  errors text[] := ARRAY[]::text[];
  any_done boolean := false;
  any_rest boolean := false;
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;
  IF transfer.status::text IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Transfer % sudah %.', transfer.number,
      CASE transfer.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;

  FOR line IN
    SELECT l.id, l.input_qty, l.input_uom_id, l.qty, p.sku,
      (SELECT count(*) FROM stock_moves m WHERE m.line_id = l.id) AS move_count,
      (SELECT count(*) FROM stock_moves m
       WHERE m.line_id = l.id AND m.input_uom_id = l.input_uom_id) AS same_uom_count,
      (SELECT coalesce(sum(m.input_qty), 0) FROM stock_moves m WHERE m.line_id = l.id) AS moved,
      (SELECT coalesce(sum(m.qty), 0) FROM stock_moves m WHERE m.line_id = l.id) AS moved_qty
    FROM transfer_lines l JOIN products p ON p.id = l.product_id
    WHERE l.transfer_id = p_transfer_id ORDER BY l.position
  LOOP
    IF p_done ? line.id::text AND (line.move_count <> 1 OR line.same_uom_count <> 1) THEN
      errors := errors || format('Qty selesai %s diisi lewat rincian pergerakannya.', line.sku);
      CONTINUE;
    END IF;
    -- Qty selesai: isian user (satuan baris), atau jumlah pergerakan. Pergerakan yang satuannya
    -- berbeda dari baris (dipecah per lot/lokasi dalam satuan stok, I-01) dibandingkan dalam
    -- satuan stok.
    done_limit := line.input_qty;
    BEGIN
      IF p_done ? line.id::text THEN
        done := (p_done ->> line.id::text)::numeric;
      ELSIF line.same_uom_count = line.move_count THEN
        done := line.moved;
      ELSE
        done := line.moved_qty;
        done_limit := line.qty;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      errors := errors || format('Qty %s bukan angka.', line.sku);
      CONTINUE;
    END;
    IF done < 0 OR done > done_limit OR scale(done) > 4 THEN
      errors := errors || format(
        'Qty %s harus antara 0 dan %s.', line.sku, replace(trim_scale(line.input_qty)::text, '.', ',')
      );
    END IF;
    any_done := any_done OR done > 0;
    any_rest := any_rest OR done < done_limit;
  END LOOP;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  IF NOT any_done THEN
    RAISE EXCEPTION 'Isi qty minimal satu baris. Untuk membatalkan semuanya, batalkan transfer.';
  END IF;

  -- Transfer lanjutan dibuat dulu dari pergerakan yang belum diubah (lot dan lokasinya masih ada),
  -- baru qty selesai diterapkan. Permintaan antar gudang dan retur ikut disalin (R-10, R-11).
  IF any_rest AND p_create_backorder THEN
    INSERT INTO transfers (
      type, source_location_id, destination_location_id, partner_id, scheduled_date, reference,
      notes, reason, return_of_id, backorder_of_id, interwarehouse_id, return_request_id
    )
    VALUES (
      transfer.type, transfer.source_location_id, transfer.destination_location_id,
      transfer.partner_id, transfer.scheduled_date, transfer.reference, transfer.notes,
      transfer.reason, transfer.return_of_id, transfer.id, transfer.interwarehouse_id,
      transfer.return_request_id
    )
    RETURNING id INTO backorder_id;

    -- Sisa per baris: dalam satuan input baris bila semua pergerakannya bersatuan sama, selain itu
    -- dalam satuan stok produk. Lokasi (bisa sub-lokasi) mengikuti pergerakan pertamanya. Lotnya
    -- juga, kecuali baris punya beberapa rincian lot atau dilacak per nomor seri (RU-03): sisa itu
    -- lot/nomornya belum diketahui, jadi dikosongkan.
    FOR line IN
      SELECT l.*, p.uom_id AS stock_uom_id,
        CASE WHEN moved.move_count = 1 AND p.tracking <> 'serial' THEN first_move.lot_id END AS lot_id,
        -- Transfer yang mengambil stok gudang: sisa dipesan lagi dari lokasi asal transfer beserta
        -- sub-lokasinya (I-01), bukan dari rak tempat pergerakan pertama dipesan.
        CASE WHEN (SELECT warehouse_id FROM locations WHERE id = transfer.source_location_id) IS NOT NULL
          THEN transfer.source_location_id
          ELSE coalesce(first_move.source_location_id, transfer.source_location_id)
        END AS source_id,
        coalesce(first_move.destination_location_id, transfer.destination_location_id) AS destination_id,
        moved.input_qty AS moved_input, moved.qty AS moved_qty, moved.same_uom
      FROM transfer_lines l
      JOIN products p ON p.id = l.product_id
      LEFT JOIN LATERAL (
        SELECT m.lot_id, m.source_location_id, m.destination_location_id
        FROM stock_moves m WHERE m.line_id = l.id ORDER BY m.created_at LIMIT 1
      ) first_move ON true
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(m.input_qty), 0) AS input_qty, coalesce(sum(m.qty), 0) AS qty,
          coalesce(bool_and(m.input_uom_id = l.input_uom_id), true) AS same_uom,
          count(*) AS move_count
        FROM stock_moves m WHERE m.line_id = l.id
      ) moved
      WHERE l.transfer_id = p_transfer_id ORDER BY l.position
    LOOP
      IF line.same_uom THEN
        rest := line.input_qty - coalesce((p_done ->> line.id::text)::numeric, line.moved_input);
      ELSE
        rest := line.qty - line.moved_qty;
        line.input_uom_id := line.stock_uom_id;
      END IF;
      IF rest <= 0 THEN
        CONTINUE;
      END IF;
      INSERT INTO transfer_lines (transfer_id, position, product_id, input_qty, input_uom_id)
      VALUES (backorder_id, line.position, line.product_id, rest, line.input_uom_id)
      RETURNING id INTO backorder_line;
      INSERT INTO stock_moves (
        transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        backorder_id, backorder_line, line.product_id, line.lot_id, line.position, rest,
        line.input_uom_id, line.source_id, line.destination_id
      );
    END LOOP;
  END IF;

  -- Qty selesai baris yang disebut di p_done. Pesanan stok dilepas dulu (qty pergerakan tidak boleh
  -- lebih kecil dari yang dipesan); validate_transfer() yang mengikutinya memang melepasnya juga
  -- sebelum memeriksa stok (perbaikan R-07/R-08: validasi parsial transfer keluar yang memesan stok).
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_done)) THEN
    PERFORM unreserve_transfer(p_transfer_id);
  END IF;
  FOR line IN
    SELECT l.id, (p_done ->> l.id::text)::numeric AS done
    FROM transfer_lines l WHERE l.transfer_id = p_transfer_id AND p_done ? l.id::text
  LOOP
    IF line.done = 0 THEN
      DELETE FROM stock_moves WHERE line_id = line.id;
    ELSE
      UPDATE stock_moves SET input_qty = line.done WHERE line_id = line.id;
    END IF;
  END LOOP;
  RETURN backorder_id;
END;
$$;

