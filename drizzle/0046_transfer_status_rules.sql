-- Custom SQL migration file, put your code below! --
-- Alur status transfer (backlog R-06, PRD bagian 6.3, mengikuti hmx-002): Draft → Konfirmasi →
-- Menunggu / Sebagian tersedia / Siap → Selesai, Batal dari status mana pun sebelum Selesai,
-- Kembali ke Draft dari status yang sudah dikonfirmasi. Status hanya berubah lewat fungsi di sini
-- dan validate_transfer() (penanda app.ledger_write).
--
-- Catatan migrasi: nilai enum waiting dan partially_available baru ditambahkan di migrasi
-- sebelumnya, dalam transaksi yang sama. Postgres menolak nilai enum baru dipakai di transaksi itu,
-- jadi status dibandingkan sebagai teks (status::text) dan semua fungsi di sini plpgsql.

-- Transfer yang mengambil stok dari lokasi gudang (bukan lokasi virtual) perlu dicek ketersediaannya.
CREATE OR REPLACE FUNCTION transfer_needs_stock(p_transfer_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM transfers t JOIN locations l ON l.id = t.source_location_id
    WHERE t.id = p_transfer_id AND l.warehouse_id IS NOT NULL
  );
END;
$$;
--> statement-breakpoint
-- Status ketersediaan transfer yang mengambil stok gudang: Siap bila semua stok cukup (aturan
-- transfer_stock_errors), Sebagian tersedia bila sebagian ada, Menunggu bila tidak ada sama sekali.
CREATE OR REPLACE FUNCTION transfer_availability(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF NOT transfer_needs_stock(p_transfer_id)
    OR cardinality(transfer_stock_errors(p_transfer_id)) = 0 THEN
    RETURN 'ready';
  END IF;
  IF EXISTS (
    SELECT 1 FROM stock_moves m
    JOIN stock_balances b ON b.product_id = m.product_id AND b.location_id = m.source_location_id
      AND b.lot_id IS NOT DISTINCT FROM m.lot_id
    WHERE m.transfer_id = p_transfer_id AND b.qty > 0
  ) THEN
    RETURN 'partially_available';
  END IF;
  RETURN 'waiting';
END;
$$;
--> statement-breakpoint
-- Syarat Konfirmasi (PRD bagian 6.3): ada baris barang, tanggal rencana, alasan untuk scrap dan
-- penyesuaian, lot/nomor seri sesuai pelacakan, dan batas retur. Semua alasan dilaporkan sekaligus.
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
  errors := errors || transfer_tracking_errors(p_transfer_id) || transfer_line_errors(p_transfer_id);
  IF transfer.type = 'return' THEN
    errors := errors || return_errors(p_transfer_id);
  END IF;
  RETURN errors;
END;
$$;
--> statement-breakpoint
-- Ubah status transfer lewat penanda app.ledger_write (dipakai fungsi di bawah saja).
CREATE OR REPLACE FUNCTION set_transfer_status(p_transfer_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE transfers
  SET status = p_status::transfer_status,
    cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END
  WHERE id = p_transfer_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Kunci transfer dan pastikan statusnya salah satu yang diizinkan.
CREATE OR REPLACE FUNCTION lock_transfer_in(p_transfer_id uuid, p_allowed text[], p_message text)
RETURNS transfers
LANGUAGE plpgsql AS $$
DECLARE
  transfer transfers%ROWTYPE;
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;
  IF NOT (transfer.status::text = ANY (p_allowed)) THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
  RETURN transfer;
END;
$$;
--> statement-breakpoint
-- Konfirmasi: Draft → Siap (transfer masuk) atau Menunggu/Sebagian tersedia/Siap menurut stok.
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
  next_status := transfer_availability(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, next_status);
  RETURN next_status;
END;
$$;
--> statement-breakpoint
-- Cek stok: hitung ulang status transfer yang sudah dikonfirmasi.
CREATE OR REPLACE FUNCTION check_transfer_availability(p_transfer_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  next_status text;
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['waiting', 'partially_available', 'ready'],
    'Stok hanya dicek untuk transfer yang sudah dikonfirmasi.'
  );
  next_status := transfer_availability(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, next_status);
  RETURN next_status;
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
  PERFORM set_transfer_status(p_transfer_id, 'cancelled');
END;
$$;
--> statement-breakpoint
-- Status hanya berubah lewat fungsi di atas dan validate_transfer(); transfer baru selalu Draft.
CREATE OR REPLACE FUNCTION transfers_status_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_write_enabled() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.status::text <> 'draft' THEN
    RAISE EXCEPTION 'Transfer baru selalu berstatus Draft.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Status transfer hanya bisa diubah lewat Konfirmasi, Cek stok, Kembali ke Draft, Batal, atau Validasi.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_status_guard
  BEFORE INSERT OR UPDATE OF status ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_status_guard();
--> statement-breakpoint
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
      WHERE m.product_id = NEW.id AND t.status::text NOT IN ('done', 'cancelled')
    )
  ) THEN
    RAISE EXCEPTION 'Pelacakan produk % tidak bisa diubah karena produk masih punya stok atau transaksi yang belum selesai.',
      NEW.sku;
  END IF;
  RETURN NEW;
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
  IF transfer.status::text IN ('done', 'cancelled') THEN
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
