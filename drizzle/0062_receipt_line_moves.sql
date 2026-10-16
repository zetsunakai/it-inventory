-- Rincian lot/nomor seri per baris penerimaan (backlog RU-03): satu baris permintaan boleh diterima
-- dengan beberapa lot atau nomor seri. Rincian menggantikan pergerakan baris itu; qty selesai baris
-- saat validasi = jumlah rinciannya (split_backorder), sisanya jadi transfer lanjutan atau dibuang.
--
-- p_moves: [{"lot": "LOT-A" | null, "qty": "4"}], qty dalam satuan stok produk. Lot kosong = nomor
-- otomatis saat validasi (hanya produk ber-nomor otomatis). Semua kesalahan dilaporkan sekaligus.
CREATE OR REPLACE FUNCTION set_receipt_line_moves(p_line_id uuid, p_moves jsonb) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  line record;
  transfer transfers%ROWTYPE;
  item record;
  total numeric := 0;
  lot uuid;
  errors text[] := ARRAY[]::text[];
  names text[] := ARRAY[]::text[];
BEGIN
  SELECT l.*, p.sku, p.tracking, p.lot_auto, p.uom_id AS stock_uom_id
  INTO line
  FROM transfer_lines l JOIN products p ON p.id = l.product_id
  WHERE l.id = p_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris penerimaan tidak ditemukan.';
  END IF;
  SELECT * INTO transfer FROM transfers WHERE id = line.transfer_id FOR UPDATE;
  IF transfer.type <> 'receipt' THEN
    RAISE EXCEPTION 'Rincian lot hanya untuk penerimaan.';
  END IF;
  IF transfer.status::text NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Rincian lot hanya bisa diubah selama penerimaan Draft atau Siap.';
  END IF;
  IF jsonb_typeof(p_moves) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Rincian lot tidak terbaca. Muat ulang halaman.';
  END IF;

  FOR item IN
    SELECT ordinality AS n, nullif(trim(value ->> 'lot'), '') AS lot_name, value ->> 'qty' AS qty_text
    FROM jsonb_array_elements(p_moves) WITH ORDINALITY
  LOOP
    DECLARE
      qty numeric;
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
      END IF;
      total := total + coalesce(qty, 0);
      IF line.tracking = 'none' AND item.lot_name IS NOT NULL THEN
        errors := errors || format('Produk %s tidak dilacak per lot atau nomor seri.', line.sku);
      ELSIF line.tracking <> 'none' AND item.lot_name IS NULL AND NOT line.lot_auto THEN
        errors := errors || format('%s: isi %s produk %s.', item_label,
          CASE line.tracking WHEN 'serial' THEN 'nomor seri' ELSE 'nomor lot' END, line.sku);
      END IF;
      IF line.tracking = 'serial' AND item.lot_name IS NOT NULL AND qty IS DISTINCT FROM 1 THEN
        errors := errors || format('Nomor seri %s: qty harus 1.', item.lot_name);
      END IF;
      IF length(item.lot_name) > 50 THEN
        errors := errors || format('%s: nomor lot maksimal 50 karakter.', item_label);
      END IF;
      IF item.lot_name = ANY (names) THEN
        errors := errors || format('%s %s tercatat dua kali.',
          CASE line.tracking WHEN 'serial' THEN 'Nomor seri' ELSE 'Lot' END, item.lot_name);
      END IF;
      IF item.lot_name IS NOT NULL THEN
        names := names || item.lot_name;
      END IF;
    END;
  END LOOP;
  IF total > line.qty THEN
    errors := errors || format('Qty diterima %s melebihi qty diminta %s.',
      replace(trim_scale(total)::text, '.', ','), replace(trim_scale(line.qty)::text, '.', ','));
  END IF;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;

  DELETE FROM stock_moves WHERE line_id = p_line_id;
  FOR item IN
    SELECT nullif(trim(value ->> 'lot'), '') AS lot_name, (value ->> 'qty')::numeric AS qty
    FROM jsonb_array_elements(p_moves)
  LOOP
    lot := NULL;
    IF item.lot_name IS NOT NULL THEN
      SELECT id INTO lot FROM lots WHERE product_id = line.product_id AND name = item.lot_name;
      IF lot IS NULL THEN
        INSERT INTO lots (product_id, name) VALUES (line.product_id, item.lot_name)
        RETURNING id INTO lot;
      END IF;
    END IF;
    INSERT INTO stock_moves (
      transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
      source_location_id, destination_location_id
    )
    VALUES (
      line.transfer_id, p_line_id, line.product_id, lot, line.position, item.qty,
      line.stock_uom_id, transfer.source_location_id, transfer.destination_location_id
    );
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Penerimaan boleh dikonfirmasi sebelum lot/nomor seri diketahui; validasi tetap mewajibkannya.
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
      -- Saat Konfirmasi, barang keluar dari gudang tanpa lot diisi reservasi (lot terlama dulu),
      -- dan lot penerimaan dicatat saat barang diterima (RU-03), jadi belum wajib.
      AND NOT (p_for_confirm AND (
        source_warehouse_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM transfers t WHERE t.id = moves.transfer_id AND t.type = 'receipt')
      ))
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
CREATE OR REPLACE FUNCTION split_backorder(
  p_transfer_id uuid, p_done jsonb, p_create_backorder boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  transfer transfers%ROWTYPE;
  line record;
  done numeric;
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
    SELECT l.id, l.input_qty, l.input_uom_id, p.sku,
      (SELECT count(*) FROM stock_moves m WHERE m.line_id = l.id) AS move_count,
      (SELECT count(*) FROM stock_moves m
       WHERE m.line_id = l.id AND m.input_uom_id = l.input_uom_id) AS same_uom_count,
      (SELECT coalesce(sum(m.input_qty), 0) FROM stock_moves m WHERE m.line_id = l.id) AS moved
    FROM transfer_lines l JOIN products p ON p.id = l.product_id
    WHERE l.transfer_id = p_transfer_id ORDER BY l.position
  LOOP
    IF p_done ? line.id::text AND (line.move_count <> 1 OR line.same_uom_count <> 1) THEN
      errors := errors || format('Qty selesai %s diisi lewat rincian pergerakannya.', line.sku);
      CONTINUE;
    END IF;
    BEGIN
      done := coalesce((p_done ->> line.id::text)::numeric, line.moved);
    EXCEPTION WHEN invalid_text_representation THEN
      errors := errors || format('Qty %s bukan angka.', line.sku);
      CONTINUE;
    END;
    IF done < 0 OR done > line.input_qty OR scale(done) > 4 THEN
      errors := errors || format(
        'Qty %s harus antara 0 dan %s.', line.sku, replace(trim_scale(line.input_qty)::text, '.', ',')
      );
    END IF;
    any_done := any_done OR done > 0;
    any_rest := any_rest OR done < line.input_qty;
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
        coalesce(first_move.source_location_id, transfer.source_location_id) AS source_id,
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

