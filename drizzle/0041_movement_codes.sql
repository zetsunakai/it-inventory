CREATE TYPE "public"."movement_code" AS ENUM('gr', 'gi', 'ilt', 'itw_out', 'itw_in', 'itw_rtn', 'gr_rtn', 'gi_rtn', 'pu', 'adj_in', 'adj_out');--> statement-breakpoint
CREATE TYPE "public"."movement_direction" AS ENUM('in', 'out', 'internal');--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "movement_code" "movement_code";--> statement-breakpoint
-- Ditambah tanpa NOT NULL dulu; diisi untuk data lama di bawah (backlog R-04).
ALTER TABLE "transfers" ADD COLUMN "movement_code" "movement_code";--> statement-breakpoint
-- Arah pergerakan dilihat dari gudang (sama dengan MOVEMENT_CODES di src/lib/inventory.ts).
CREATE OR REPLACE FUNCTION movement_direction(p_code movement_code) RETURNS movement_direction
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_code IN ('gr', 'gi_rtn', 'itw_in', 'itw_rtn', 'adj_in') THEN 'in'
    WHEN p_code = 'ilt' THEN 'internal'
    ELSE 'out'
  END::movement_direction;
$$;--> statement-breakpoint
-- Kode pergerakan transfer dari jenis dan lokasinya (PRD bagian 6.2):
--   penerimaan gr, pengiriman gi, scrap/pemakaian pu, penyesuaian adj_in/adj_out menurut arah,
--   retur gr_rtn (ke vendor) atau gi_rtn (dari customer) menurut transfer asal, transfer internal
--   ilt bila di dalam satu gudang, itw_out bila keluar ke lokasi transit atau ke gudang lain,
--   itw_in bila masuk dari lokasi transit.
CREATE OR REPLACE FUNCTION transfer_movement_code(
  p_type transfer_type, p_source_id uuid, p_destination_id uuid, p_return_of_id uuid
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
      WHEN src.type = 'transit' THEN 'itw_in'
      WHEN src.warehouse_id IS DISTINCT FROM dst.warehouse_id THEN 'itw_out'
      ELSE 'ilt'
    END
  END::movement_code
  FROM locations src, locations dst
  WHERE src.id = p_source_id AND dst.id = p_destination_id;
$$;--> statement-breakpoint
-- Data lama: transfer dan baris Selesai terkunci trigger, jadi pengunci (dan audit, supaya log
-- tidak penuh oleh pengisian ini) dimatikan sementara di transaksi migrasi ini saja.
ALTER TABLE "transfers" DISABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "stock_moves" DISABLE TRIGGER USER;--> statement-breakpoint
UPDATE "transfers"
SET "movement_code" = transfer_movement_code(type, source_location_id, destination_location_id, return_of_id);--> statement-breakpoint
UPDATE "stock_moves" m SET "movement_code" = t.movement_code
FROM "transfers" t WHERE t.id = m.transfer_id AND m.status = 'done';--> statement-breakpoint
ALTER TABLE "transfers" ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "stock_moves" ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "movement_code" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "transfers" ALTER COLUMN "movement_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "direction" "movement_direction" GENERATED ALWAYS AS (movement_direction(movement_code)) STORED;
