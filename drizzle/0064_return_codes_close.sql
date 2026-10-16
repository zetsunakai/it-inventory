ALTER TABLE "return_requests" ADD COLUMN "close_reason" text;--> statement-breakpoint
-- Kode retur mengikuti hmx-002 (backlog I-02, return_request.py): `gi_rtn` = barang keluar karena
-- retur (retur ke vendor, pengganti ke customer), `gr_rtn` = barang masuk karena retur (retur dari
-- customer, pengganti dari vendor). Sebelumnya terbalik dan transfer pengganti memakai gr/gi.
DROP FUNCTION transfer_movement_code(transfer_type, uuid, uuid, uuid, uuid);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfer_movement_code(
  p_type transfer_type, p_source_id uuid, p_destination_id uuid, p_return_of_id uuid,
  p_interwarehouse_id uuid DEFAULT NULL, p_return_request_id uuid DEFAULT NULL
) RETURNS movement_code
LANGUAGE sql STABLE AS $$
  SELECT CASE p_type
    WHEN 'receipt' THEN CASE WHEN p_return_request_id IS NOT NULL THEN 'gr_rtn' ELSE 'gr' END
    WHEN 'delivery' THEN CASE WHEN p_return_request_id IS NOT NULL THEN 'gi_rtn' ELSE 'gi' END
    WHEN 'scrap' THEN 'pu'
    WHEN 'adjustment' THEN CASE WHEN src.type = 'adjustment' THEN 'adj_in' ELSE 'adj_out' END
    WHEN 'return' THEN CASE
      WHEN (SELECT type FROM transfers WHERE id = p_return_of_id) = 'receipt' THEN 'gi_rtn'
      ELSE 'gr_rtn'
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
    NEW.interwarehouse_id, NEW.return_request_id
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER transfers_set_movement_code ON transfers;
--> statement-breakpoint
CREATE TRIGGER transfers_set_movement_code
  BEFORE INSERT OR UPDATE OF type, source_location_id, destination_location_id, return_of_id,
    interwarehouse_id, return_request_id
  ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_set_movement_code();
--> statement-breakpoint
-- Arah per kode (dipakai kolom generated transfers.direction): gr_rtn masuk, gi_rtn keluar.
CREATE OR REPLACE FUNCTION movement_direction(p_code movement_code) RETURNS movement_direction
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_code IN ('gr', 'gr_rtn', 'itw_in', 'itw_rtn', 'adj_in') THEN 'in'
    WHEN p_code = 'ilt' THEN 'internal'
    ELSE 'out'
  END::movement_direction;
$$;
--> statement-breakpoint
-- Data lama: kode transfer retur dan pengganti diganti, juga di pergerakan Selesai (kode saja; qty,
-- saldo, dan saldo periode tidak berubah). Kunci pergerakan Selesai dan periode dilewati sementara.
SELECT set_config('app.ledger_write', 'on', true);
--> statement-breakpoint
ALTER TABLE stock_moves DISABLE TRIGGER stock_moves_lock;
--> statement-breakpoint
ALTER TABLE stock_moves DISABLE TRIGGER stock_moves_period_guard;
--> statement-breakpoint
ALTER TABLE transfers DISABLE TRIGGER transfers_lock;
--> statement-breakpoint
UPDATE transfers t
SET movement_code = transfer_movement_code(
  t.type, t.source_location_id, t.destination_location_id, t.return_of_id, t.interwarehouse_id,
  t.return_request_id
)
WHERE t.type = 'return' OR t.return_request_id IS NOT NULL;
--> statement-breakpoint
UPDATE stock_moves m
SET movement_code = t.movement_code
FROM transfers t
WHERE t.id = m.transfer_id AND m.movement_code IS NOT NULL
  AND (t.type = 'return' OR t.return_request_id IS NOT NULL)
  AND m.movement_code IS DISTINCT FROM t.movement_code;
--> statement-breakpoint
ALTER TABLE transfers ENABLE TRIGGER transfers_lock;
--> statement-breakpoint
ALTER TABLE stock_moves ENABLE TRIGGER stock_moves_period_guard;
--> statement-breakpoint
ALTER TABLE stock_moves ENABLE TRIGGER stock_moves_lock;
--> statement-breakpoint
-- Tutup tanpa pengganti (I-02, action_close_without_replacement hmx): permintaan yang barangnya
-- sudah diretur tapi penggantinya tidak akan datang/dikirim. Transfer retur harus sudah selesai;
-- transfer pengganti yang masih terbuka dibatalkan; permintaan Selesai dengan alasannya.
CREATE OR REPLACE FUNCTION close_return_request_without_replacement(
  p_return_request_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  request return_requests%ROWTYPE;
  open_transfer uuid;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT * INTO request FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permintaan retur tidak ditemukan.';
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Alasan menutup tanpa pengganti wajib diisi.';
  END IF;
  IF request.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Hanya permintaan retur yang sedang diproses yang bisa ditutup tanpa pengganti.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM return_request_lines WHERE return_request_id = p_return_request_id AND action = 'replace'
  ) THEN
    RAISE EXCEPTION 'Permintaan retur ini tidak punya baris dengan pengganti.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM transfers
    WHERE return_request_id = p_return_request_id AND type = 'return'
      AND status::text NOT IN ('done', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'Transfer retur harus Selesai dulu sebelum permintaan ditutup tanpa pengganti.';
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE return_requests SET close_reason = btrim(p_reason) WHERE id = p_return_request_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
  FOR open_transfer IN
    SELECT id FROM transfers
    WHERE return_request_id = p_return_request_id AND type <> 'return'
      AND status::text NOT IN ('done', 'cancelled')
  LOOP
    PERFORM cancel_transfer(open_transfer);
  END LOOP;
  IF (SELECT status FROM return_requests WHERE id = p_return_request_id) = 'in_progress' THEN
    PERFORM set_return_request_status(p_return_request_id, 'done');
  END IF;
END;
$$;
