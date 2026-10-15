-- Custom SQL migration file, put your code below! --
-- Retur sebagai dokumen permintaan (backlog R-11, PRD bagian 6.2, mengikuti return_request
-- hmx-002):
--   Draft (baris per produk × lot transfer asal, tindakan retur saja / dengan pengganti) →
--   Konfirmasi: qty dicek terhadap sisa yang bisa diretur, transfer retur dibuat dan dikonfirmasi,
--   status Diproses →
--   semua transfer retur Selesai/Batal: baris dengan pengganti membuat transfer pengganti (Draft)
--   sebesar qty yang benar-benar diretur: penerimaan dari vendor atau pengiriman ke customer →
--   Selesai bila tidak ada lagi transfer terbuka. Semua transfer retur batal = permintaan Batal.
-- Retur tanpa rujukan tidak diambil: gudang berikat wajib punya dokumen asal (PRD bagian 8.5).

ALTER TABLE transfers
  ADD CONSTRAINT transfers_return_request_kind CHECK (
    return_request_id IS NULL OR type IN ('return', 'receipt', 'delivery')
  );
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_return_request_status(p_return_request_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE return_requests SET status = p_status::return_request_status
  WHERE id = p_return_request_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Permintaan: nomor PRT/tahun/urut (WIB) dan pembuat diisi saat insert. Jenis dan partner diambil
-- dari transfer asal (penerimaan → ke vendor, pengiriman → dari customer). Lokasi gudang harus
-- lokasi internal aktif di gudang transfer asal. Isi hanya bisa diubah saat Draft; status hanya
-- lewat fungsi (penanda app.ledger_write).
CREATE OR REPLACE FUNCTION return_requests_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  origin transfers%ROWTYPE;
  loc locations%ROWTYPE;
  origin_warehouse uuid;
  year text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.number, '') = '' THEN
      year := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');
      NEW.number := 'PRT/' || year || '/' || lpad(next_number('return_request', year)::text, 5, '0');
    END IF;
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Permintaan retur baru selalu berstatus Draft.';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Status permintaan retur hanya berubah lewat Konfirmasi, Batal, atau penyelesaian transfernya.';
    END IF;
    IF OLD.status <> 'draft' AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Permintaan retur % sudah dikonfirmasi dan tidak bisa diubah.', OLD.number;
    END IF;
    IF NEW.origin_id <> OLD.origin_id THEN
      RAISE EXCEPTION 'Transfer asal permintaan retur tidak bisa diubah.';
    END IF;
  END IF;

  SELECT * INTO origin FROM transfers WHERE id = NEW.origin_id;
  IF TG_OP = 'INSERT' AND NOT ledger_write_enabled()
    AND (origin.status::text <> 'done' OR origin.type NOT IN ('receipt', 'delivery')) THEN
    RAISE EXCEPTION 'Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai.';
  END IF;
  NEW.type := CASE origin.type WHEN 'receipt' THEN 'vendor' ELSE 'customer' END;
  NEW.partner_id := origin.partner_id;

  SELECT * INTO loc FROM locations WHERE id = NEW.location_id;
  origin_warehouse := (
    SELECT warehouse_id FROM locations
    WHERE id = CASE origin.type WHEN 'receipt' THEN origin.destination_location_id
      ELSE origin.source_location_id END
  );
  IF loc.type <> 'internal' OR loc.warehouse_id IS DISTINCT FROM origin_warehouse THEN
    RAISE EXCEPTION 'Lokasi retur harus lokasi internal di gudang transfer asal.';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.location_id <> OLD.location_id) AND NOT loc.active THEN
    RAISE EXCEPTION 'Lokasi % sudah diarsipkan.', loc.code;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER return_requests_before_write
  BEFORE INSERT OR UPDATE ON return_requests
  FOR EACH ROW EXECUTE FUNCTION return_requests_before_write();
--> statement-breakpoint
-- Baris: produk × lot harus ada di transfer asal (pergerakan Selesai); hanya bisa diubah selama
-- permintaan Draft.
CREATE OR REPLACE FUNCTION return_request_lines_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
BEGIN
  SELECT * INTO request FROM return_requests
  WHERE id = coalesce(NEW.return_request_id, OLD.return_request_id);
  IF request.status IS NOT NULL AND request.status <> 'draft' AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Baris permintaan retur yang sudah dikonfirmasi tidak bisa diubah.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM stock_moves m
    WHERE m.transfer_id = request.origin_id AND m.status = 'done'
      AND m.product_id = NEW.product_id AND m.lot_id IS NOT DISTINCT FROM NEW.lot_id
  ) THEN
    RAISE EXCEPTION '%', format('Produk %s%s tidak ada di transfer asal.',
      (SELECT sku FROM products WHERE id = NEW.product_id),
      coalesce(' lot ' || (SELECT name FROM lots WHERE id = NEW.lot_id), ''));
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER return_request_lines_before_write
  BEFORE INSERT OR UPDATE OR DELETE ON return_request_lines
  FOR EACH ROW EXECUTE FUNCTION return_request_lines_before_write();
--> statement-breakpoint
CREATE TRIGGER return_requests_set_updated_at
  BEFORE UPDATE ON return_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER return_request_lines_set_updated_at
  BEFORE UPDATE ON return_request_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('return_requests');
--> statement-breakpoint
SELECT enable_audit('return_request_lines');
--> statement-breakpoint
-- Sisa yang masih bisa diretur dari satu transfer asal, per produk × lot (satuan stok): qty asal
-- dikurangi retur yang sudah Selesai dan qty permintaan lain yang transfer returnya masih terbuka
-- (belum Selesai). p_exclude_request_id = permintaan yang sedang dicek tidak menghitung dirinya.
DROP FUNCTION returnable_lines(uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION returnable_lines(
  p_origin_id uuid, p_exclude_request_id uuid DEFAULT NULL
) RETURNS TABLE (product_id uuid, lot_id uuid, qty numeric)
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
  ),
  committed AS (
    SELECT l.product_id, l.lot_id, sum(greatest(l.qty - coalesce(d.qty, 0), 0)) AS qty
    FROM return_requests r
    JOIN return_request_lines l ON l.return_request_id = r.id
    LEFT JOIN LATERAL (
      SELECT sum(m.qty) AS qty
      FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
      WHERE t.return_request_id = r.id AND t.type = 'return' AND m.status = 'done'
        AND m.product_id = l.product_id AND m.lot_id IS NOT DISTINCT FROM l.lot_id
    ) d ON true
    WHERE r.origin_id = p_origin_id AND r.status = 'in_progress'
      AND r.id IS DISTINCT FROM p_exclude_request_id
      AND EXISTS (
        SELECT 1 FROM transfers t
        WHERE t.return_request_id = r.id AND t.type = 'return'
          AND t.status::text NOT IN ('done', 'cancelled')
      )
    GROUP BY l.product_id, l.lot_id
  )
  SELECT o.product_id, o.lot_id, o.qty - coalesce(r.qty, 0) - coalesce(c.qty, 0)
  FROM origin o
  LEFT JOIN returned r ON r.product_id = o.product_id AND r.lot_id IS NOT DISTINCT FROM o.lot_id
  LEFT JOIN committed c ON c.product_id = o.product_id AND c.lot_id IS NOT DISTINCT FROM o.lot_id
  WHERE o.qty - coalesce(r.qty, 0) - coalesce(c.qty, 0) > 0;
$$;
--> statement-breakpoint
-- Alasan permintaan belum bisa dikonfirmasi: belum ada baris, atau qty baris melebihi sisa yang
-- bisa diretur.
CREATE OR REPLACE FUNCTION return_request_errors(p_return_request_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM return_request_lines WHERE return_request_id = p_return_request_id
    ) THEN ARRAY['Permintaan retur belum punya baris barang.']
    ELSE (
      SELECT coalesce(array_agg(
        format('Qty retur %s%s melebihi sisa yang bisa diretur: %s.', p.sku,
          coalesce(' lot ' || lt.name, ''),
          replace(trim_scale(coalesce(rem.qty, 0))::text, '.', ','))
        ORDER BY l.position, p.sku
      ), ARRAY[]::text[])
      FROM return_request_lines l
      JOIN return_requests r ON r.id = l.return_request_id
      JOIN products p ON p.id = l.product_id
      LEFT JOIN lots lt ON lt.id = l.lot_id
      LEFT JOIN returnable_lines(r.origin_id, r.id) rem
        ON rem.product_id = l.product_id AND rem.lot_id IS NOT DISTINCT FROM l.lot_id
      WHERE l.return_request_id = p_return_request_id AND l.qty > coalesce(rem.qty, 0)
    )
  END;
$$;
--> statement-breakpoint
-- Transfer milik permintaan retur tidak melebihi permintaannya:
--   transfer retur: per produk × lot, qty transfer ini + retur Selesai lain ≤ qty baris;
--   transfer pengganti: per produk, qty transfer ini + pengganti Selesai lain ≤ qty yang sudah
--   diretur dari baris dengan pengganti.
CREATE OR REPLACE FUNCTION return_request_transfer_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  transfer transfers%ROWTYPE;
  request_number text;
  errors text[];
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id;
  IF transfer.return_request_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;
  SELECT number INTO request_number FROM return_requests WHERE id = transfer.return_request_id;

  IF transfer.type = 'return' THEN
    WITH needed AS (
      SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
      FROM stock_moves m WHERE m.transfer_id = p_transfer_id
      GROUP BY m.product_id, m.lot_id
    ),
    earlier AS (
      SELECT m.product_id, m.lot_id, sum(m.qty) AS qty
      FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
      WHERE t.return_request_id = transfer.return_request_id AND t.type = 'return'
        AND t.id <> p_transfer_id AND m.status = 'done'
      GROUP BY m.product_id, m.lot_id
    )
    SELECT coalesce(array_agg(
      CASE WHEN l.id IS NULL
        THEN format('Produk %s%s tidak ada di permintaan retur %s.', p.sku,
          coalesce(' lot ' || lt.name, ''), request_number)
        ELSE format('Qty retur %s%s melebihi sisa permintaan retur %s: %s.', p.sku,
          coalesce(' lot ' || lt.name, ''), request_number,
          replace(trim_scale(greatest(l.qty - coalesce(e.qty, 0), 0))::text, '.', ','))
      END ORDER BY p.sku, lt.name
    ), ARRAY[]::text[])
    INTO errors
    FROM needed n
    JOIN products p ON p.id = n.product_id
    LEFT JOIN lots lt ON lt.id = n.lot_id
    LEFT JOIN return_request_lines l ON l.return_request_id = transfer.return_request_id
      AND l.product_id = n.product_id AND l.lot_id IS NOT DISTINCT FROM n.lot_id
    LEFT JOIN earlier e ON e.product_id = n.product_id AND e.lot_id IS NOT DISTINCT FROM n.lot_id
    WHERE l.id IS NULL OR n.qty > l.qty - coalesce(e.qty, 0);
    RETURN errors;
  END IF;

  WITH needed AS (
    SELECT m.product_id, sum(m.qty) AS qty
    FROM stock_moves m WHERE m.transfer_id = p_transfer_id
    GROUP BY m.product_id
  ),
  replaceable AS (
    SELECT m.product_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
    WHERE t.return_request_id = transfer.return_request_id AND t.type = 'return'
      AND m.status = 'done'
      AND EXISTS (
        SELECT 1 FROM return_request_lines l
        WHERE l.return_request_id = transfer.return_request_id AND l.action = 'replace'
          AND l.product_id = m.product_id AND l.lot_id IS NOT DISTINCT FROM m.lot_id
      )
    GROUP BY m.product_id
  ),
  replaced AS (
    SELECT m.product_id, sum(m.qty) AS qty
    FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
    WHERE t.return_request_id = transfer.return_request_id AND t.type <> 'return'
      AND t.id <> p_transfer_id AND m.status = 'done'
    GROUP BY m.product_id
  )
  SELECT coalesce(array_agg(
    format('Qty pengganti %s melebihi qty yang diretur dengan pengganti: %s.', p.sku,
      replace(trim_scale(greatest(coalesce(r.qty, 0) - coalesce(d.qty, 0), 0))::text, '.', ','))
    ORDER BY p.sku
  ), ARRAY[]::text[])
  INTO errors
  FROM needed n
  JOIN products p ON p.id = n.product_id
  LEFT JOIN replaceable r ON r.product_id = n.product_id
  LEFT JOIN replaced d ON d.product_id = n.product_id
  WHERE n.qty > coalesce(r.qty, 0) - coalesce(d.qty, 0);
  RETURN errors;
END;
$$;
--> statement-breakpoint
-- Transfer milik permintaan retur: hanya transfer retur dengan transfer asal yang sama dengan
-- permintaannya, atau transfer pengganti (penerimaan untuk retur ke vendor, pengiriman untuk retur
-- dari customer). Retur baru selalu lewat permintaan retur. Permintaannya tidak bisa diganti.
CREATE OR REPLACE FUNCTION transfers_return_request_check() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  replacement_type text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.return_request_id IS DISTINCT FROM OLD.return_request_id THEN
    RAISE EXCEPTION 'Permintaan retur sebuah transfer tidak bisa diubah.';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.type = 'return' AND NEW.return_request_id IS NULL THEN
    RAISE EXCEPTION 'Retur dibuat lewat permintaan retur.';
  END IF;
  IF NEW.return_request_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO request FROM return_requests WHERE id = NEW.return_request_id;
  IF NEW.type = 'return' AND NEW.return_of_id IS DISTINCT FROM request.origin_id THEN
    RAISE EXCEPTION 'Transfer retur harus merujuk transfer asal permintaan returnya.';
  END IF;
  replacement_type := CASE request.type WHEN 'vendor' THEN 'receipt' ELSE 'delivery' END;
  IF NEW.type <> 'return' AND NEW.type::text <> replacement_type THEN
    RAISE EXCEPTION 'Pengganti retur ke vendor berupa penerimaan; pengganti retur dari customer berupa pengiriman.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Data lama (M2-07): setiap transfer retur jadi satu permintaan retur dengan tindakan retur saja.
-- Transfer dan baris yang terkunci (Selesai) diisi dengan trigger dimatikan sementara.
DO $$
DECLARE
  t record;
  request_id uuid;
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  ALTER TABLE transfers DISABLE TRIGGER USER;
  FOR t IN
    SELECT tr.*, o.type AS origin_type, o.source_location_id AS origin_source,
      o.destination_location_id AS origin_destination
    FROM transfers tr JOIN transfers o ON o.id = tr.return_of_id
    WHERE tr.type = 'return' AND tr.return_request_id IS NULL
    ORDER BY tr.created_at, tr.number
  LOOP
    INSERT INTO return_requests (
      type, status, origin_id, partner_id, location_id, scheduled_date, notes, created_at
    )
    VALUES (
      CASE t.origin_type WHEN 'receipt' THEN 'vendor' ELSE 'customer' END::return_request_type,
      CASE t.status::text WHEN 'done' THEN 'done' WHEN 'cancelled' THEN 'cancelled'
        ELSE 'in_progress' END::return_request_status,
      t.return_of_id, t.partner_id,
      CASE t.origin_type WHEN 'receipt' THEN t.origin_destination ELSE t.origin_source END,
      t.scheduled_date, t.notes, t.created_at
    )
    RETURNING id INTO request_id;
    INSERT INTO return_request_lines (return_request_id, position, product_id, lot_id, qty)
    SELECT request_id, row_number() OVER (ORDER BY min(m.position), p.sku), m.product_id, m.lot_id,
      sum(m.qty)
    FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = t.id
    GROUP BY m.product_id, m.lot_id, p.sku
    HAVING sum(m.qty) > 0;
    UPDATE transfers SET return_request_id = request_id WHERE id = t.id;
  END LOOP;
  ALTER TABLE transfers ENABLE TRIGGER USER;
  PERFORM set_config('app.ledger_write', '', true);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_return_request_check
  BEFORE INSERT OR UPDATE OF type, return_of_id, return_request_id ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_return_request_check();
--> statement-breakpoint
-- Buat transfer milik permintaan retur dengan baris (satu pergerakan per baris).
-- p_lines: jsonb array {product_id, lot_id, qty, uom_id}.
CREATE OR REPLACE FUNCTION create_return_request_transfer(
  p_return_request_id uuid, p_type transfer_type, p_source_id uuid, p_destination_id uuid,
  p_lines jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  transfer_id uuid;
  line_id uuid;
  item record;
  n integer := 0;
BEGIN
  SELECT * INTO request FROM return_requests WHERE id = p_return_request_id;
  INSERT INTO transfers (
    type, source_location_id, destination_location_id, partner_id, scheduled_date, reference,
    notes, return_of_id, return_request_id
  )
  VALUES (
    p_type, p_source_id, p_destination_id, request.partner_id,
    coalesce(request.scheduled_date, (now() AT TIME ZONE 'Asia/Jakarta')::date),
    request.number, request.notes,
    CASE WHEN p_type = 'return' THEN request.origin_id END, p_return_request_id
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
  RETURN transfer_id;
END;
$$;
--> statement-breakpoint
-- Konfirmasi permintaan: qty dicek terhadap sisa yang bisa diretur (transfer asal dikunci supaya
-- dua permintaan dari transfer yang sama tidak lolos berdua), lalu transfer retur dibuat dan
-- dikonfirmasi (retur ke vendor memesan stok). Mengembalikan id transfer retur.
CREATE OR REPLACE FUNCTION confirm_return_request(p_return_request_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  origin transfers%ROWTYPE;
  errors text[];
  lines jsonb;
  return_id uuid;
BEGIN
  SELECT * INTO request FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan retur tidak ditemukan.';
  END IF;
  IF request.status <> 'draft' THEN
    RAISE EXCEPTION 'Hanya permintaan retur Draft yang bisa dikonfirmasi.';
  END IF;
  SELECT * INTO origin FROM transfers WHERE id = request.origin_id FOR UPDATE;
  errors := return_request_errors(p_return_request_id);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'product_id', l.product_id, 'lot_id', l.lot_id, 'qty', l.qty, 'uom_id', p.uom_id
  ) ORDER BY l.position)
  INTO lines
  FROM return_request_lines l JOIN products p ON p.id = l.product_id
  WHERE l.return_request_id = p_return_request_id;
  PERFORM set_return_request_status(p_return_request_id, 'in_progress');
  IF request.type = 'vendor' THEN
    return_id := create_return_request_transfer(
      p_return_request_id, 'return', request.location_id, origin.source_location_id, lines
    );
  ELSE
    return_id := create_return_request_transfer(
      p_return_request_id, 'return', origin.destination_location_id, request.location_id, lines
    );
  END IF;
  PERFORM confirm_transfer(return_id);
  RETURN return_id;
END;
$$;
--> statement-breakpoint
-- Status permintaan setelah transfernya Selesai/Batal:
--   masih ada transfer retur terbuka → tetap Diproses;
--   semua transfer retur Batal → permintaan Batal;
--   belum ada transfer pengganti dan ada baris dengan pengganti yang sudah diretur → transfer
--   pengganti (Draft) dibuat sebesar qty yang diretur, per produk;
--   tidak ada transfer terbuka lagi → Selesai (transfer pengganti yang dibatalkan = ditutup tanpa
--   pengganti).
CREATE OR REPLACE FUNCTION refresh_return_request(p_return_request_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  origin transfers%ROWTYPE;
  lines jsonb;
BEGIN
  SELECT * INTO request FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF request.status <> 'in_progress' THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfers
    WHERE return_request_id = p_return_request_id AND type = 'return'
      AND status::text NOT IN ('done', 'cancelled')
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM transfers
    WHERE return_request_id = p_return_request_id AND type = 'return' AND status::text = 'done'
  ) THEN
    PERFORM set_return_request_status(p_return_request_id, 'cancelled');
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM transfers WHERE return_request_id = p_return_request_id AND type <> 'return'
  ) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'product_id', x.product_id, 'lot_id', null, 'qty', x.qty, 'uom_id', p.uom_id
    ) ORDER BY x.position)
    INTO lines
    FROM (
      SELECT m.product_id, min(l.position) AS position, sum(m.qty) AS qty
      FROM stock_moves m
      JOIN transfers t ON t.id = m.transfer_id
      JOIN return_request_lines l ON l.return_request_id = p_return_request_id
        AND l.action = 'replace' AND l.product_id = m.product_id
        AND l.lot_id IS NOT DISTINCT FROM m.lot_id
      WHERE t.return_request_id = p_return_request_id AND t.type = 'return'
        AND m.status = 'done'
      GROUP BY m.product_id
    ) x
    JOIN products p ON p.id = x.product_id;
    IF lines IS NOT NULL THEN
      SELECT * INTO origin FROM transfers WHERE id = request.origin_id;
      IF request.type = 'vendor' THEN
        PERFORM create_return_request_transfer(
          p_return_request_id, 'receipt', origin.source_location_id, request.location_id, lines
        );
      ELSE
        PERFORM create_return_request_transfer(
          p_return_request_id, 'delivery', request.location_id, origin.destination_location_id,
          lines
        );
      END IF;
      RETURN;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM transfers
    WHERE return_request_id = p_return_request_id AND status::text NOT IN ('done', 'cancelled')
  ) THEN
    PERFORM set_return_request_status(p_return_request_id, 'done');
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION return_request_after_transfer_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM refresh_return_request(NEW.return_request_id);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER return_request_after_transfer_status
  AFTER UPDATE OF status ON transfers
  FOR EACH ROW WHEN (NEW.return_request_id IS NOT NULL
    AND NEW.status::text IN ('done', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION return_request_after_transfer_status();
--> statement-breakpoint
-- Batal: hanya sebelum ada barang yang diretur; transfer retur yang masih terbuka ikut dibatalkan.
CREATE OR REPLACE FUNCTION cancel_return_request(p_return_request_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  open_transfer uuid;
BEGIN
  SELECT * INTO request FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan retur tidak ditemukan.';
  END IF;
  IF request.status IN ('done', 'cancelled') OR EXISTS (
    SELECT 1 FROM transfers
    WHERE return_request_id = p_return_request_id AND status::text = 'done'
  ) THEN
    RAISE EXCEPTION 'Permintaan retur yang barangnya sudah diretur tidak bisa dibatalkan.';
  END IF;
  FOR open_transfer IN
    SELECT id FROM transfers
    WHERE return_request_id = p_return_request_id AND status::text NOT IN ('done', 'cancelled')
  LOOP
    PERFORM cancel_transfer(open_transfer);
  END LOOP;
  IF (SELECT status FROM return_requests WHERE id = p_return_request_id) <> 'cancelled' THEN
    PERFORM set_return_request_status(p_return_request_id, 'cancelled');
  END IF;
END;
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
  errors := errors || return_request_transfer_errors(p_transfer_id);
  RETURN errors;
END;
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
  -- Batas permintaan retur. Dua transfer retur dari permintaan yang sama tidak divalidasi bersamaan
  -- karena validate_transfer() mengunci transfer asalnya.
  errors := errors || return_request_transfer_errors(p_transfer_id);
  errors := errors || interwarehouse_transit_errors(p_transfer_id);
  errors := errors || customs_gate_errors(p_transfer_id);
  RETURN errors;
END;
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
