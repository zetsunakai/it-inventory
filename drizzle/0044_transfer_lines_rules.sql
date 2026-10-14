-- Custom SQL migration file, put your code below! --
-- Baris permintaan transfer (backlog R-05, PRD bagian 6.1): transfer_lines menyimpan produk dan
-- qty yang diminta; stock_moves menjadi rincian yang benar-benar bergerak (per lot/lokasi) milik
-- baris itu. Total pergerakan per baris tidak boleh melebihi qty diminta.

-- Baris permintaan: qty dalam satuan stok dihitung dari input (satuan khusus hanya untuk produknya),
-- produk arsip tidak bisa dipakai untuk baris baru.
CREATE OR REPLACE FUNCTION transfer_lines_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
BEGIN
  SELECT * INTO product FROM products WHERE id = NEW.product_id;
  IF (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) AND NOT product.active THEN
    RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
  END IF;
  IF EXISTS (
    SELECT 1 FROM uoms WHERE id = NEW.input_uom_id
      AND product_id IS NOT NULL AND product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Satuan % hanya untuk produk lain, tidak bisa dipakai untuk produk %.',
      (SELECT code FROM uoms WHERE id = NEW.input_uom_id), product.sku;
  END IF;
  NEW.qty := convert_qty(NEW.input_qty, NEW.input_uom_id, product.uom_id);
  IF TG_OP = 'UPDATE' AND NEW.product_id <> OLD.product_id
    AND EXISTS (SELECT 1 FROM stock_moves WHERE line_id = NEW.id) THEN
    RAISE EXCEPTION 'Produk baris yang sudah punya pergerakan tidak bisa diganti.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfer_lines_before_write
  BEFORE INSERT OR UPDATE ON transfer_lines
  FOR EACH ROW EXECUTE FUNCTION transfer_lines_before_write();
--> statement-breakpoint
-- Baris transfer Selesai/Batal tidak bisa ditambah, diubah, atau dihapus; qty selesai hanya diisi
-- validate_transfer() (penanda app.ledger_write).
CREATE OR REPLACE FUNCTION transfer_lines_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  transfer_status transfer_status;
BEGIN
  IF ledger_write_enabled() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  SELECT status INTO transfer_status FROM transfers
  WHERE id = coalesce(NEW.transfer_id, OLD.transfer_id);
  -- Transfer sudah terhapus: baris ikut terhapus lewat ON DELETE CASCADE.
  IF TG_OP = 'DELETE' AND transfer_status IS NULL THEN
    RETURN OLD;
  END IF;
  IF transfer_status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Baris barang transfer yang sudah % tidak bisa diubah.',
      CASE transfer_status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.done_qty IS NOT NULL THEN
    RAISE EXCEPTION 'Qty selesai hanya diisi saat validasi transfer.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfer_lines_lock
  BEFORE INSERT OR UPDATE OR DELETE ON transfer_lines
  FOR EACH ROW EXECUTE FUNCTION transfer_lines_lock();
--> statement-breakpoint
CREATE TRIGGER transfer_lines_set_updated_at
  BEFORE UPDATE ON transfer_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('transfer_lines');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_moves_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
  transfer transfers%ROWTYPE;
  move_src locations%ROWTYPE;
  move_dst locations%ROWTYPE;
  transfer_src locations%ROWTYPE;
  transfer_dst locations%ROWTYPE;
BEGIN
  SELECT * INTO product FROM products WHERE id = NEW.product_id;
  IF (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) AND NOT product.active THEN
    RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
  END IF;
  IF NEW.lot_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND product_id = NEW.product_id) THEN
    RAISE EXCEPTION 'Lot bukan milik produk %.', product.sku;
  END IF;
  -- Satuan khusus produk hanya untuk produknya sendiri (backlog R-03).
  IF EXISTS (
    SELECT 1 FROM uoms WHERE id = NEW.input_uom_id
      AND product_id IS NOT NULL AND product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Satuan % hanya untuk produk lain, tidak bisa dipakai untuk produk %.',
      (SELECT code FROM uoms WHERE id = NEW.input_uom_id), product.sku;
  END IF;
  NEW.qty := convert_qty(NEW.input_qty, NEW.input_uom_id, product.uom_id);

  -- Baris pergerakan milik baris permintaan transfer yang sama, dengan produk yang sama (R-05).
  IF NOT EXISTS (
    SELECT 1 FROM transfer_lines
    WHERE id = NEW.line_id AND transfer_id = NEW.transfer_id AND product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Baris pergerakan % tidak sesuai baris permintaannya.', product.sku;
  END IF;

  SELECT * INTO transfer FROM transfers WHERE id = NEW.transfer_id;
  SELECT * INTO move_src FROM locations WHERE id = NEW.source_location_id;
  SELECT * INTO move_dst FROM locations WHERE id = NEW.destination_location_id;
  SELECT * INTO transfer_src FROM locations WHERE id = transfer.source_location_id;
  SELECT * INTO transfer_dst FROM locations WHERE id = transfer.destination_location_id;
  IF NOT (
    (transfer_src.warehouse_id IS NULL AND move_src.id = transfer_src.id)
    OR (transfer_src.warehouse_id IS NOT NULL AND move_src.warehouse_id = transfer_src.warehouse_id
        AND move_src.type = transfer_src.type)
  ) THEN
    RAISE EXCEPTION 'Lokasi asal baris % tidak sesuai lokasi asal transfer.', product.sku;
  END IF;
  IF NOT (
    (transfer_dst.warehouse_id IS NULL AND move_dst.id = transfer_dst.id)
    OR (transfer_dst.warehouse_id IS NOT NULL AND move_dst.warehouse_id = transfer_dst.warehouse_id
        AND move_dst.type = transfer_dst.type)
  ) THEN
    RAISE EXCEPTION 'Lokasi tujuan baris % tidak sesuai lokasi tujuan transfer.', product.sku;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.source_location_id <> OLD.source_location_id) AND NOT move_src.active THEN
    RAISE EXCEPTION 'Lokasi asal % sudah diarsipkan.', move_src.code;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.destination_location_id <> OLD.destination_location_id)
    AND NOT move_dst.active THEN
    RAISE EXCEPTION 'Lokasi tujuan % sudah diarsipkan.', move_dst.code;
  END IF;

  NEW.source_warehouse_id := move_src.warehouse_id;
  NEW.destination_warehouse_id := move_dst.warehouse_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Qty yang bergerak per baris tidak boleh melebihi qty diminta (dalam satuan stok).
CREATE OR REPLACE FUNCTION transfer_line_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(
    format('Qty selesai %s (%s) melebihi qty diminta (%s %s).', p.sku,
      replace(trim_scale(moved.qty)::text, '.', ','),
      replace(trim_scale(l.qty)::text, '.', ','), u.code)
    ORDER BY l.position, p.sku
  ), ARRAY[]::text[])
  FROM transfer_lines l
  JOIN products p ON p.id = l.product_id
  JOIN uoms u ON u.id = p.uom_id
  JOIN LATERAL (SELECT sum(m.qty) AS qty FROM stock_moves m WHERE m.line_id = l.id) moved ON true
  WHERE l.transfer_id = p_transfer_id AND moved.qty > l.qty;
$$;
--> statement-breakpoint
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

  IF NOT EXISTS (SELECT 1 FROM transfer_lines WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Transfer belum punya baris barang.'::text;
  ELSIF NOT EXISTS (SELECT 1 FROM stock_moves WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Belum ada qty yang selesai. Isi qty selesai minimal satu baris.'::text;
  END IF;
  errors := errors || transfer_line_errors(p_transfer_id);

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
        transfer_id, line_id, product_id, lot_id, position, input_qty, input_uom_id,
        source_location_id, destination_location_id
      )
      VALUES (
        move.transfer_id, move.line_id, move.product_id, new_lot(move.product_id), move.position,
        1, move.stock_uom_id, move.source_location_id, move.destination_location_id
      );
    END LOOP;
  END LOOP;
END;
$$;
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
--> statement-breakpoint
-- Penerimaan dan pengiriman parsial (M2-05, diperbarui R-05): qty selesai per baris permintaan
-- dipisah dari sisanya sebelum validasi. Qty diminta di baris asal tetap; sisanya (qty diminta −
-- qty selesai) menjadi baris transfer lanjutan (backorder, Draft) beserta pergerakannya.
--
-- p_done: {"<id baris permintaan>": "<qty selesai dalam satuan input baris>"}. Baris yang tidak
-- disebut dianggap selesai penuh. Hanya untuk baris yang punya tepat satu pergerakan dengan satuan
-- yang sama dengan barisnya. Mengembalikan id transfer lanjutan, atau NULL bila tidak ada sisa.
CREATE OR REPLACE FUNCTION split_backorder(p_transfer_id uuid, p_done jsonb) RETURNS uuid
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
  IF transfer.status NOT IN ('draft', 'ready') THEN
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
  -- baru qty selesai diterapkan.
  IF any_rest THEN
    INSERT INTO transfers (
      type, source_location_id, destination_location_id, partner_id, scheduled_date, reference,
      notes, reason, return_of_id, backorder_of_id
    )
    VALUES (
      transfer.type, transfer.source_location_id, transfer.destination_location_id,
      transfer.partner_id, transfer.scheduled_date, transfer.reference, transfer.notes,
      transfer.reason, transfer.return_of_id, transfer.id
    )
    RETURNING id INTO backorder_id;

    -- Sisa per baris: dalam satuan input baris bila semua pergerakannya bersatuan sama, selain itu
    -- dalam satuan stok produk. Lot dan lokasi (bisa sub-lokasi) mengikuti pergerakan pertamanya.
    FOR line IN
      SELECT l.*, p.uom_id AS stock_uom_id, first_move.lot_id,
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
          coalesce(bool_and(m.input_uom_id = l.input_uom_id), true) AS same_uom
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

  -- Qty selesai baris yang disebut di p_done.
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION approve_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_count stock_counts%ROWTYPE;
  adjustment_location uuid;
  virtual_location uuid;
  direction text;
  v_transfer_id uuid;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi opname tidak ditemukan.';
  END IF;
  IF v_count.status <> 'review' THEN
    RAISE EXCEPTION 'Hanya sesi opname yang menunggu persetujuan yang bisa disetujui.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Sesi opname hanya bisa disetujui Manajer.';
  END IF;

  SELECT id INTO virtual_location FROM locations
  WHERE type = 'adjustment' AND warehouse_id IS NULL AND active ORDER BY code LIMIT 1;
  IF virtual_location IS NULL THEN
    RAISE EXCEPTION 'Lokasi virtual penyesuaian belum ada. Hubungi Administrator.';
  END IF;
  -- Lokasi transfer: lokasi sesi, atau lokasi baris pertama bila sesi untuk seluruh gudang.
  -- Lokasi tiap baris tetap lokasinya masing-masing (sub-lokasi di gudang yang sama).
  adjustment_location := coalesce(
    v_count.location_id,
    (SELECT location_id FROM stock_count_lines WHERE stock_count_id = p_count_id LIMIT 1)
  );

  FOREACH direction IN ARRAY ARRAY['increase', 'decrease'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM stock_count_lines WHERE stock_count_id = p_count_id
        AND CASE direction WHEN 'increase' THEN counted_qty > system_qty
                           ELSE counted_qty < system_qty END
    ) THEN
      CONTINUE;
    END IF;
    INSERT INTO transfers (
      type, source_location_id, destination_location_id, reason, stock_count_id,
      approved_at, approved_by
    )
    VALUES (
      'adjustment',
      CASE direction WHEN 'increase' THEN virtual_location ELSE adjustment_location END,
      CASE direction WHEN 'increase' THEN adjustment_location ELSE virtual_location END,
      format('Selisih stock opname %s', v_count.number), p_count_id, now(), actor
    )
    RETURNING id INTO v_transfer_id;

    -- Satu baris permintaan per baris hitung, masing-masing dengan satu pergerakan (R-05).
    WITH diff AS (
      SELECT cl.product_id, cl.lot_id, cl.location_id, abs(cl.counted_qty - cl.system_qty) AS qty,
        p.uom_id, row_number() OVER (ORDER BY lp.path, p.sku) AS position
      FROM stock_count_lines cl
      JOIN products p ON p.id = cl.product_id
      JOIN location_paths lp ON lp.id = cl.location_id
      WHERE cl.stock_count_id = p_count_id
        AND CASE direction WHEN 'increase' THEN cl.counted_qty > cl.system_qty
                           ELSE cl.counted_qty < cl.system_qty END
    ),
    new_lines AS (
      INSERT INTO transfer_lines (transfer_id, position, product_id, input_qty, input_uom_id)
      SELECT v_transfer_id, position, product_id, qty, uom_id FROM diff
      RETURNING id, position
    )
    INSERT INTO stock_moves (
      transfer_id, line_id, position, product_id, lot_id, input_qty, input_uom_id,
      source_location_id, destination_location_id
    )
    SELECT v_transfer_id, l.id, d.position, d.product_id, d.lot_id, d.qty, d.uom_id,
      CASE direction WHEN 'increase' THEN virtual_location ELSE d.location_id END,
      CASE direction WHEN 'increase' THEN d.location_id ELSE virtual_location END
    FROM diff d JOIN new_lines l ON l.position = d.position;

    PERFORM validate_transfer(v_transfer_id, v_count.cut_off_at);
  END LOOP;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'approved', approved_at = now(), approved_by = actor
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
