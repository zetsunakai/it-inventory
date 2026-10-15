CREATE TYPE "public"."usage_type" AS ENUM('usage', 'scrap', 'transit_loss', 'other');--> statement-breakpoint
ALTER TABLE "transfers" ADD COLUMN "usage_type" "usage_type";--> statement-breakpoint
-- Data lama (backlog R-12): scrap dari lokasi transit = susut transit (R-10), selain itu scrap.
-- Transfer Selesai terkunci trigger, jadi trigger dimatikan sementara di transaksi migrasi ini.
ALTER TABLE "transfers" DISABLE TRIGGER USER;--> statement-breakpoint
UPDATE "transfers" t
SET "usage_type" = CASE WHEN l.type = 'transit' THEN 'transit_loss' ELSE 'scrap' END::usage_type
FROM "locations" l
WHERE l.id = t.source_location_id AND t.type = 'scrap';--> statement-breakpoint
ALTER TABLE "transfers" ENABLE TRIGGER USER;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_usage_type_scrap_only" CHECK (("transfers"."type" = 'scrap') = ("transfers"."usage_type" is not null));--> statement-breakpoint
-- Jenis pemakaian (PRD bagian 6.2, usage_type hmx-002): hanya untuk transfer scrap (kode pu).
-- Kosong diisi: jenis transfer asal untuk lanjutan (split_backorder), susut transit bila dari
-- lokasi transit, selain itu scrap. Susut transit selalu dan hanya dari lokasi transit.
CREATE OR REPLACE FUNCTION transfers_usage_type() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_type location_type;
BEGIN
  IF NEW.type <> 'scrap' THEN
    IF NEW.usage_type IS NOT NULL THEN
      RAISE EXCEPTION 'Jenis pemakaian hanya untuk transfer pemakaian dan scrap.';
    END IF;
    RETURN NEW;
  END IF;
  SELECT type INTO source_type FROM locations WHERE id = NEW.source_location_id;
  IF NEW.usage_type IS NULL THEN
    NEW.usage_type := coalesce(
      (SELECT usage_type FROM transfers WHERE id = NEW.backorder_of_id),
      CASE WHEN source_type = 'transit' THEN 'transit_loss' ELSE 'scrap' END::usage_type
    );
  END IF;
  IF source_type = 'transit' AND NEW.usage_type <> 'transit_loss' THEN
    RAISE EXCEPTION 'Barang di lokasi transit hanya bisa dicatat sebagai susut transit.';
  END IF;
  IF NEW.usage_type = 'transit_loss' AND source_type <> 'transit' THEN
    RAISE EXCEPTION 'Susut transit hanya dicatat dari lokasi transit, lewat permintaan transfer antar gudang.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_usage_type
  BEFORE INSERT OR UPDATE OF type, usage_type, source_location_id ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_usage_type();
