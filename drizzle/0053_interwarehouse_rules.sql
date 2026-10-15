-- Custom SQL migration file, put your code below! --
-- Transfer antar gudang lewat lokasi transit (backlog R-10, PRD bagian 6.2 dan 6.4, mengikuti
-- iwt_request hmx-002 tipe transit):
--   Draft → Konfirmasi: transfer keluar (lokasi asal → transit) dibuat dan memesan stok;
--   transfer keluar Selesai → transfer masuk (transit → lokasi tujuan) dibuat sebesar qty yang
--   keluar, status permintaan Di perjalanan;
--   sisa di transit dikembalikan ke gudang asal (itw_rtn) atau dicatat sebagai susut transit
--   (scrap dari transit, perlu persetujuan Manajer);
--   permintaan Selesai bila tidak ada lagi barang di transit dan tidak ada transfer terbuka.
-- Barang di jalan tercatat di lokasi transit (tanpa gudang), bukan di stok gudang mana pun.

INSERT INTO locations (code, name, type)
VALUES ('TRANSIT', 'Transit antar gudang', 'transit')
ON CONFLICT (code) DO NOTHING;
--> statement-breakpoint
ALTER TABLE interwarehouse_transfers
  ADD CONSTRAINT interwarehouse_transfers_locations_differ
    CHECK (source_location_id <> destination_location_id);
--> statement-breakpoint
-- Permintaan: nomor ITW/tahun/urut (WIB) dan pembuat diisi saat insert; lokasi asal dan tujuan
-- lokasi internal aktif di gudang berbeda, lokasi transit tanpa gudang. Isi hanya bisa diubah saat
-- Draft; status hanya lewat fungsi (penanda app.ledger_write).
CREATE OR REPLACE FUNCTION interwarehouse_transfers_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  src locations%ROWTYPE;
  dst locations%ROWTYPE;
  transit locations%ROWTYPE;
  year text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.number, '') = '' THEN
      year := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');
      NEW.number := 'ITW/' || year || '/' || lpad(next_number('interwarehouse', year)::text, 5, '0');
    END IF;
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Permintaan transfer antar gudang baru selalu berstatus Draft.';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Status permintaan transfer antar gudang hanya berubah lewat Konfirmasi, Batal, atau penyelesaian transfernya.';
    END IF;
    IF OLD.status <> 'draft' AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Permintaan transfer antar gudang % sudah dikonfirmasi dan tidak bisa diubah.', OLD.number;
    END IF;
  END IF;

  SELECT * INTO src FROM locations WHERE id = NEW.source_location_id;
  SELECT * INTO dst FROM locations WHERE id = NEW.destination_location_id;
  SELECT * INTO transit FROM locations WHERE id = NEW.transit_location_id;
  IF src.type <> 'internal' OR dst.type <> 'internal' THEN
    RAISE EXCEPTION 'Lokasi asal dan tujuan harus lokasi internal gudang.';
  END IF;
  IF src.warehouse_id = dst.warehouse_id THEN
    RAISE EXCEPTION 'Gudang asal dan tujuan harus berbeda. Untuk satu gudang, pakai Pindah lokasi.';
  END IF;
  IF transit.type <> 'transit' OR transit.warehouse_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lokasi transit harus lokasi transit di luar gudang.';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.source_location_id <> OLD.source_location_id
    OR NEW.destination_location_id <> OLD.destination_location_id THEN
    IF NOT src.active OR NOT dst.active OR NOT transit.active THEN
      RAISE EXCEPTION 'Lokasi asal, tujuan, atau transit sudah diarsipkan.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER interwarehouse_transfers_before_write
  BEFORE INSERT OR UPDATE ON interwarehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION interwarehouse_transfers_before_write();
--> statement-breakpoint
-- Baris permintaan: qty dalam satuan stok, produk aktif, satuan khusus hanya untuk produknya, lot
-- milik produknya; hanya bisa diubah selama permintaan Draft.
CREATE OR REPLACE FUNCTION interwarehouse_transfer_lines_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
  request_status interwarehouse_status;
BEGIN
  SELECT status INTO request_status FROM interwarehouse_transfers
  WHERE id = coalesce(NEW.interwarehouse_id, OLD.interwarehouse_id);
  IF request_status IS NOT NULL AND request_status <> 'draft' AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Baris permintaan yang sudah dikonfirmasi tidak bisa diubah.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  SELECT * INTO product FROM products WHERE id = NEW.product_id;
  IF (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id) AND NOT product.active THEN
    RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
  END IF;
  IF NEW.lot_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND product_id = NEW.product_id) THEN
    RAISE EXCEPTION 'Lot bukan milik produk %.', product.sku;
  END IF;
  IF EXISTS (
    SELECT 1 FROM uoms WHERE id = NEW.input_uom_id
      AND product_id IS NOT NULL AND product_id <> NEW.product_id
  ) THEN
    RAISE EXCEPTION 'Satuan % hanya untuk produk lain, tidak bisa dipakai untuk produk %.',
      (SELECT code FROM uoms WHERE id = NEW.input_uom_id), product.sku;
  END IF;
  NEW.qty := convert_qty(NEW.input_qty, NEW.input_uom_id, product.uom_id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER interwarehouse_transfer_lines_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON interwarehouse_transfer_lines
  FOR EACH ROW EXECUTE FUNCTION interwarehouse_transfer_lines_before_write();
--> statement-breakpoint
CREATE TRIGGER interwarehouse_transfers_set_updated_at
  BEFORE UPDATE ON interwarehouse_transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER interwarehouse_transfer_lines_set_updated_at
  BEFORE UPDATE ON interwarehouse_transfer_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('interwarehouse_transfers');
--> statement-breakpoint
SELECT enable_audit('interwarehouse_transfer_lines');
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfers_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  src locations%ROWTYPE;
  dst locations%ROWTYPE;
  origin transfers%ROWTYPE;
  year text;
  ok boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.number, '') = '' THEN
      year := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');
      NEW.number := transfer_number_prefix(NEW.type) || '/' || year || '/' ||
        lpad(next_number('transfer:' || NEW.type, year)::text, 5, '0');
    END IF;
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
  ELSIF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'Jenis transfer tidak bisa diubah.';
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.source_location_id IS NOT DISTINCT FROM OLD.source_location_id
    AND NEW.destination_location_id IS NOT DISTINCT FROM OLD.destination_location_id
    AND NEW.partner_id IS NOT DISTINCT FROM OLD.partner_id
    AND NEW.return_of_id IS NOT DISTINCT FROM OLD.return_of_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO src FROM locations WHERE id = NEW.source_location_id;
  SELECT * INTO dst FROM locations WHERE id = NEW.destination_location_id;
  IF (TG_OP = 'INSERT' OR NEW.source_location_id <> OLD.source_location_id) AND NOT src.active THEN
    RAISE EXCEPTION 'Lokasi asal % sudah diarsipkan.', src.code;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.destination_location_id <> OLD.destination_location_id)
    AND NOT dst.active THEN
    RAISE EXCEPTION 'Lokasi tujuan % sudah diarsipkan.', dst.code;
  END IF;
  IF NEW.partner_id IS NOT NULL
    AND (TG_OP = 'INSERT' OR NEW.partner_id IS DISTINCT FROM OLD.partner_id)
    AND NOT (SELECT active FROM partners WHERE id = NEW.partner_id) THEN
    RAISE EXCEPTION 'Partner sudah diarsipkan.';
  END IF;

  IF NEW.type = 'return' THEN
    SELECT * INTO origin FROM transfers WHERE id = NEW.return_of_id;
    IF origin.status <> 'done' OR origin.type NOT IN ('receipt', 'delivery') THEN
      RAISE EXCEPTION 'Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai.';
    END IF;
    IF NEW.partner_id IS DISTINCT FROM origin.partner_id THEN
      RAISE EXCEPTION 'Partner retur harus sama dengan transfer asalnya.';
    END IF;
  END IF;

  ok := CASE NEW.type
    WHEN 'receipt' THEN src.type = 'vendor' AND dst.type = 'internal'
    WHEN 'delivery' THEN src.type = 'internal' AND dst.type = 'customer'
    -- Pindah lokasi hanya di dalam satu gudang; antar gudang lewat lokasi transit (R-09, R-10).
    WHEN 'internal' THEN src.type IN ('internal', 'transit') AND dst.type IN ('internal', 'transit')
      AND NOT (src.type = 'internal' AND dst.type = 'internal'
        AND src.warehouse_id IS DISTINCT FROM dst.warehouse_id)
    -- Susut transit (R-10): dari lokasi transit ke lokasi scrap.
    WHEN 'scrap' THEN src.type IN ('internal', 'transit') AND dst.type = 'scrap'
    WHEN 'adjustment' THEN (src.type = 'adjustment' AND dst.type = 'internal')
      OR (src.type = 'internal' AND dst.type = 'adjustment')
    WHEN 'return' THEN CASE origin.type
      WHEN 'receipt' THEN src.type = 'internal' AND dst.type = 'vendor'
      ELSE src.type = 'customer' AND dst.type = 'internal'
    END
  END;
  IF NOT ok THEN
    RAISE EXCEPTION '%', CASE NEW.type
      WHEN 'receipt' THEN 'Penerimaan harus dari lokasi vendor ke lokasi internal gudang.'
      WHEN 'delivery' THEN 'Pengiriman harus dari lokasi internal gudang ke lokasi customer.'
      WHEN 'internal' THEN CASE
        WHEN src.type = 'internal' AND dst.type = 'internal'
          THEN 'Pindah lokasi hanya di dalam satu gudang. Barang antar gudang dipindah lewat lokasi transit.'
        ELSE 'Transfer internal harus antar lokasi internal atau transit.'
      END
      WHEN 'scrap' THEN 'Scrap harus dari lokasi internal gudang (atau transit) ke lokasi scrap.'
      WHEN 'adjustment' THEN 'Penyesuaian harus antara lokasi penyesuaian dan lokasi internal gudang.'
      ELSE 'Retur harus kebalikan arah transfer asalnya.'
    END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER transfers_set_movement_code ON transfers;
--> statement-breakpoint
DROP FUNCTION transfer_movement_code(transfer_type, uuid, uuid, uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfer_movement_code(
  p_type transfer_type, p_source_id uuid, p_destination_id uuid, p_return_of_id uuid,
  p_interwarehouse_id uuid DEFAULT NULL
) RETURNS movement_code
LANGUAGE sql STABLE AS $$
  SELECT CASE p_type
    WHEN 'receipt' THEN 'gr'
    WHEN 'delivery' THEN 'gi'
    WHEN 'scrap' THEN 'pu'
    WHEN 'adjustment' THEN CASE WHEN src.type = 'adjustment' THEN 'adj_in' ELSE 'adj_out' END
    WHEN 'return' THEN CASE
      WHEN (SELECT type FROM transfers WHERE id = p_return_of_id) = 'receipt' THEN 'gr_rtn'
      ELSE 'gi_rtn'
    END
    ELSE CASE
      WHEN dst.type = 'transit' THEN 'itw_out'
      -- Sisa transit yang dikembalikan ke gudang asal permintaan antar gudang (R-10).
      WHEN src.type = 'transit' AND dst.warehouse_id = (
        SELECT l.warehouse_id FROM interwarehouse_transfers i
        JOIN locations l ON l.id = i.source_location_id
        WHERE i.id = p_interwarehouse_id
      ) THEN 'itw_rtn'
      WHEN src.type = 'transit' THEN 'itw_in'
      WHEN src.warehouse_id IS DISTINCT FROM dst.warehouse_id THEN 'itw_out'
      ELSE 'ilt'
    END
  END::movement_code
  FROM locations src, locations dst
  WHERE src.id = p_source_id AND dst.id = p_destination_id;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfers_set_movement_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.movement_code := transfer_movement_code(
    NEW.type, NEW.source_location_id, NEW.destination_location_id, NEW.return_of_id,
    NEW.interwarehouse_id
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_set_movement_code
  BEFORE INSERT OR UPDATE OF type, source_location_id, destination_location_id, return_of_id,
    interwarehouse_id
  ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_set_movement_code();
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
  -- baru qty selesai diterapkan.
  IF any_rest AND p_create_backorder THEN
    INSERT INTO transfers (
      type, source_location_id, destination_location_id, partner_id, scheduled_date, reference,
      notes, reason, return_of_id, backorder_of_id, interwarehouse_id
    )
    VALUES (
      transfer.type, transfer.source_location_id, transfer.destination_location_id,
      transfer.partner_id, transfer.scheduled_date, transfer.reference, transfer.notes,
      transfer.reason, transfer.return_of_id, transfer.id, transfer.interwarehouse_id
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
-- Saldo di lokasi transit milik satu permintaan, per produk × lot: masuk dari transfer keluarnya,
-- dikurangi transfer masuk, kembali, dan susut transit yang sudah Selesai.
CREATE OR REPLACE FUNCTION interwarehouse_in_transit(p_interwarehouse_id uuid)
RETURNS TABLE (product_id uuid, lot_id uuid, qty numeric)
LANGUAGE sql STABLE AS $$
  SELECT m.product_id, m.lot_id,
    sum(CASE WHEN m.destination_location_id = i.transit_location_id THEN m.qty ELSE -m.qty END)
  FROM interwarehouse_transfers i
  JOIN transfers t ON t.interwarehouse_id = i.id
  JOIN stock_moves m ON m.transfer_id = t.id AND m.status = 'done'
  WHERE i.id = p_interwarehouse_id
    AND i.transit_location_id IN (m.source_location_id, m.destination_location_id)
  GROUP BY m.product_id, m.lot_id
  HAVING sum(CASE WHEN m.destination_location_id = i.transit_location_id THEN m.qty ELSE -m.qty END)
    <> 0;
$$;
--> statement-breakpoint
-- Transfer yang mengambil barang dari transit untuk satu permintaan tidak boleh melebihi yang masih
-- di perjalanan (per produk × lot).
CREATE OR REPLACE FUNCTION interwarehouse_transit_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  WITH t AS (
    SELECT tr.id, tr.interwarehouse_id, i.transit_location_id
    FROM transfers tr JOIN interwarehouse_transfers i ON i.id = tr.interwarehouse_id
    WHERE tr.id = p_transfer_id AND tr.source_location_id = i.transit_location_id
  ),
  needed AS (
    SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN t ON m.transfer_id = t.id
    GROUP BY m.product_id, m.lot_id
  )
  SELECT coalesce(array_agg(
    format('Qty %s%s melebihi yang masih di perjalanan (%s).', p.sku,
      coalesce(' lot ' || l.name, ''),
      replace(trim_scale(coalesce(it.qty, 0))::text, '.', ','))
    ORDER BY p.sku, l.name
  ), ARRAY[]::text[])
  FROM needed n
  CROSS JOIN t
  JOIN products p ON p.id = n.product_id
  LEFT JOIN lots l ON l.id = n.lot_id
  LEFT JOIN interwarehouse_in_transit(t.interwarehouse_id) it
    ON it.product_id = n.product_id AND it.lot_id IS NOT DISTINCT FROM n.lot_id
  WHERE n.qty > coalesce(it.qty, 0);
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
  errors := errors || interwarehouse_transit_errors(p_transfer_id);
  errors := errors || customs_gate_errors(p_transfer_id);
  RETURN errors;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_interwarehouse_status(p_interwarehouse_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE interwarehouse_transfers SET status = p_status::interwarehouse_status
  WHERE id = p_interwarehouse_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Buat transfer milik permintaan dengan baris (satu pergerakan per baris) lalu konfirmasi.
-- p_lines: jsonb array {product_id, lot_id, qty, uom_id}.
CREATE OR REPLACE FUNCTION create_interwarehouse_transfer(
  p_interwarehouse_id uuid, p_type transfer_type, p_source_id uuid, p_destination_id uuid,
  p_lines jsonb, p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  request interwarehouse_transfers%ROWTYPE;
  transfer_id uuid;
  line_id uuid;
  item record;
  n integer := 0;
BEGIN
  SELECT * INTO request FROM interwarehouse_transfers WHERE id = p_interwarehouse_id;
  INSERT INTO transfers (
    type, source_location_id, destination_location_id, scheduled_date, reference, notes, reason,
    interwarehouse_id
  )
  VALUES (
    p_type, p_source_id, p_destination_id,
    coalesce(request.scheduled_date, (now() AT TIME ZONE 'Asia/Jakarta')::date),
    request.number, request.notes, p_reason, p_interwarehouse_id
  )
  RETURNING id INTO transfer_id;
  FOR item IN
    SELECT * FROM jsonb_to_recordset(p_lines)
      AS x(product_id uuid, lot_id uuid, qty numeric, uom_id uuid)
  LOOP
    n := n + 1;
    INSERT INTO transfer_lines (transfer_id, position, product_id, input_qty, input_uom_id)
    VALUES (transfer_id, n, item.product_id, item.qty, item.uom_id)
    RETURNING id INTO line_id;
    INSERT INTO stock_moves (
      transfer_id, line_id, position, product_id, lot_id, input_qty, input_uom_id,
      source_location_id, destination_location_id
    )
    VALUES (
      transfer_id, line_id, n, item.product_id, item.lot_id, item.qty, item.uom_id,
      p_source_id, p_destination_id
    );
  END LOOP;
  PERFORM confirm_transfer(transfer_id);
  RETURN transfer_id;
END;
$$;
--> statement-breakpoint
-- Konfirmasi permintaan: transfer keluar (lokasi asal → transit) dibuat dan memesan stok.
CREATE OR REPLACE FUNCTION confirm_interwarehouse(p_interwarehouse_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  request interwarehouse_transfers%ROWTYPE;
  lines jsonb;
  out_id uuid;
BEGIN
  SELECT * INTO request FROM interwarehouse_transfers WHERE id = p_interwarehouse_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan transfer antar gudang tidak ditemukan.';
  END IF;
  IF request.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya permintaan Draft yang bisa dikonfirmasi.';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', product_id, 'lot_id', lot_id, 'qty', input_qty, 'uom_id', input_uom_id
  ) ORDER BY position)
  INTO lines
  FROM interwarehouse_transfer_lines WHERE interwarehouse_id = p_interwarehouse_id;
  IF lines IS NULL THEN
    RAISE EXCEPTION 'Permintaan belum punya baris barang.';
  END IF;
  PERFORM set_interwarehouse_status(p_interwarehouse_id, 'confirmed');
  out_id := create_interwarehouse_transfer(
    p_interwarehouse_id, 'internal', request.source_location_id, request.transit_location_id,
    lines
  );
  RETURN out_id;
END;
$$;
--> statement-breakpoint
-- Permintaan Selesai bila tidak ada lagi barang di transit dan tidak ada transfer terbuka.
CREATE OR REPLACE FUNCTION refresh_interwarehouse_status(p_interwarehouse_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM interwarehouse_transfers WHERE id = p_interwarehouse_id) = 'in_progress'
    AND NOT EXISTS (
      SELECT 1 FROM transfers
      WHERE interwarehouse_id = p_interwarehouse_id AND status::text NOT IN ('done', 'cancelled')
    )
    AND NOT EXISTS (SELECT 1 FROM interwarehouse_in_transit(p_interwarehouse_id)) THEN
    PERFORM set_interwarehouse_status(p_interwarehouse_id, 'done');
  END IF;
END;
$$;
--> statement-breakpoint
-- Setelah transfer milik permintaan Selesai: transfer keluar membuat transfer masuk (transit →
-- lokasi tujuan) sebesar qty yang keluar, per produk × lot; lalu status permintaan diperbarui.
CREATE OR REPLACE FUNCTION interwarehouse_after_transfer_done() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request interwarehouse_transfers%ROWTYPE;
  lines jsonb;
BEGIN
  SELECT * INTO request FROM interwarehouse_transfers WHERE id = NEW.interwarehouse_id;
  IF NEW.movement_code = 'itw_out' AND NEW.destination_location_id = request.transit_location_id
  THEN
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', m.product_id, 'lot_id', m.lot_id, 'qty', m.qty, 'uom_id', p.uom_id
    ) ORDER BY m.position, m.created_at)
    INTO lines
    FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = NEW.id;
    IF lines IS NOT NULL THEN
      PERFORM create_interwarehouse_transfer(
        request.id, 'internal', request.transit_location_id, request.destination_location_id,
        lines
      );
    END IF;
    IF request.status = 'confirmed' THEN
      PERFORM set_interwarehouse_status(request.id, 'in_progress');
    END IF;
  END IF;
  PERFORM refresh_interwarehouse_status(request.id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER interwarehouse_after_transfer_done
  AFTER UPDATE OF status ON transfers
  FOR EACH ROW WHEN (NEW.status::text = 'done' AND OLD.status::text <> 'done'
    AND NEW.interwarehouse_id IS NOT NULL)
  EXECUTE FUNCTION interwarehouse_after_transfer_done();
--> statement-breakpoint
-- Selesaikan sisa di transit (setelah semua transfer masuk diproses): kembalikan ke lokasi asal
-- (itw_rtn) atau catat sebagai susut transit (scrap dari transit, alasan wajib, disetujui
-- Manajer di halaman Scrap). Mengembalikan id transfer yang dibuat (sudah dikonfirmasi).
CREATE OR REPLACE FUNCTION settle_interwarehouse(
  p_interwarehouse_id uuid, p_mode text, p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  request interwarehouse_transfers%ROWTYPE;
  lines jsonb;
  scrap_location uuid;
BEGIN
  SELECT * INTO request FROM interwarehouse_transfers WHERE id = p_interwarehouse_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan transfer antar gudang tidak ditemukan.';
  END IF;
  IF request.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Sisa transit hanya bisa diselesaikan untuk permintaan yang sedang di perjalanan.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfers
    WHERE interwarehouse_id = p_interwarehouse_id AND status::text NOT IN ('done', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Selesaikan atau batalkan dulu transfer yang masih terbuka di permintaan ini.';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', it.product_id, 'lot_id', it.lot_id, 'qty', it.qty, 'uom_id', p.uom_id
  ))
  INTO lines
  FROM interwarehouse_in_transit(p_interwarehouse_id) it JOIN products p ON p.id = it.product_id;
  IF lines IS NULL THEN
    RAISE EXCEPTION 'Tidak ada barang yang masih di perjalanan.';
  END IF;
  IF p_mode = 'return' THEN
    RETURN create_interwarehouse_transfer(
      p_interwarehouse_id, 'internal', request.transit_location_id, request.source_location_id,
      lines
    );
  ELSIF p_mode = 'loss' THEN
    IF coalesce(btrim(p_reason), '') = '' THEN
      RAISE EXCEPTION 'Alasan susut transit wajib diisi.';
    END IF;
    SELECT id INTO scrap_location FROM locations
    WHERE type = 'scrap' AND warehouse_id IS NULL AND active ORDER BY code LIMIT 1;
    IF scrap_location IS NULL THEN
      RAISE EXCEPTION 'Lokasi virtual scrap belum ada. Hubungi Administrator.';
    END IF;
    RETURN create_interwarehouse_transfer(
      p_interwarehouse_id, 'scrap', request.transit_location_id, scrap_location, lines,
      format('Susut transit %s: %s', request.number, btrim(p_reason))
    );
  END IF;
  RAISE EXCEPTION 'Pilihan penyelesaian tidak dikenal.';
END;
$$;
--> statement-breakpoint
-- Batal: hanya sebelum ada barang yang keluar; transfer keluar yang masih terbuka ikut dibatalkan.
CREATE OR REPLACE FUNCTION cancel_interwarehouse(p_interwarehouse_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  request interwarehouse_transfers%ROWTYPE;
  open_transfer uuid;
BEGIN
  SELECT * INTO request FROM interwarehouse_transfers WHERE id = p_interwarehouse_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan transfer antar gudang tidak ditemukan.';
  END IF;
  IF request.status NOT IN ('draft', 'confirmed') OR EXISTS (
    SELECT 1 FROM transfers WHERE interwarehouse_id = p_interwarehouse_id AND status::text = 'done'
  ) THEN
    RAISE EXCEPTION 'Permintaan yang barangnya sudah keluar tidak bisa dibatalkan. Selesaikan sisanya di transit.';
  END IF;
  FOR open_transfer IN
    SELECT id FROM transfers
    WHERE interwarehouse_id = p_interwarehouse_id AND status::text NOT IN ('done', 'cancelled')
  LOOP
    PERFORM cancel_transfer(open_transfer);
  END LOOP;
  PERFORM set_interwarehouse_status(p_interwarehouse_id, 'cancelled');
END;
$$;
