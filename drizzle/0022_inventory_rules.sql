-- Custom SQL migration file, put your code below! --
-- Aturan inventory yang dipaksakan di database (PRD bagian 6, 11, 12.3, 13). Fungsi validasi,
-- saldo, dan penguncian data Selesai ada di migrasi berikutnya (M2-02).

-- Nomor berurutan per lingkup dan periode. Baris penghitung dikunci oleh ON CONFLICT DO UPDATE,
-- jadi dua transaksi yang meminta nomor bersamaan tidak pernah mendapat nomor yang sama.
CREATE OR REPLACE FUNCTION next_number(p_scope text, p_period text) RETURNS integer
LANGUAGE sql AS $$
  INSERT INTO number_sequences (scope, period, last_value) VALUES (p_scope, p_period, 1)
  ON CONFLICT (scope, period) DO UPDATE SET last_value = number_sequences.last_value + 1
  RETURNING last_value;
$$;
--> statement-breakpoint
-- Awalan nomor transfer. Sama dengan TRANSFER_NUMBER_PREFIXES di src/lib/inventory.ts.
CREATE OR REPLACE FUNCTION transfer_number_prefix(p_type transfer_type) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type
    WHEN 'receipt' THEN 'PNR'
    WHEN 'delivery' THEN 'PGR'
    WHEN 'internal' THEN 'TRF'
    WHEN 'return' THEN 'RTR'
    WHEN 'scrap' THEN 'SCR'
    WHEN 'adjustment' THEN 'ADJ'
  END;
$$;
--> statement-breakpoint
ALTER TABLE transfers
  ADD CONSTRAINT transfers_no_self_reference CHECK (
    return_of_id IS DISTINCT FROM id AND backorder_of_id IS DISTINCT FROM id
  );
--> statement-breakpoint
-- Transfer baru: nomor (mis. PNR/2026/00001, tahun WIB) dan pembuatnya dari app.user_id.
-- Lokasi dan partner dicek setiap kali dibuat atau diganti:
--   * data arsip tidak bisa dipilih untuk transfer baru (PRD bagian 5, backlog M1-08);
--   * asal dan tujuan harus sesuai jenis transfer (PRD bagian 6.2).
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
    WHEN 'internal' THEN src.type IN ('internal', 'transit') AND dst.type IN ('internal', 'transit')
    WHEN 'scrap' THEN src.type = 'internal' AND dst.type = 'scrap'
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
      WHEN 'internal' THEN 'Transfer internal harus antar lokasi internal atau transit.'
      WHEN 'scrap' THEN 'Scrap harus dari lokasi internal gudang ke lokasi scrap.'
      WHEN 'adjustment' THEN 'Penyesuaian harus antara lokasi penyesuaian dan lokasi internal gudang.'
      ELSE 'Retur harus kebalikan arah transfer asalnya.'
    END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_before_write
  BEFORE INSERT OR UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_before_write();
--> statement-breakpoint
-- Baris pergerakan:
--   * qty dalam satuan stok dihitung dari input (convert_qty menolak kategori satuan berbeda);
--   * lot harus milik produknya; produk arsip tidak bisa dipakai untuk baris baru;
--   * lokasi baris harus sesuai lokasi transfernya: lokasi virtual sama persis, lokasi gudang boleh
--     sub-lokasi lain asal di gudang yang sama (mis. bin penyimpanan saat penerimaan);
--   * gudang asal dan tujuan disalin untuk laporan per gudang.
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
  NEW.qty := convert_qty(NEW.input_qty, NEW.input_uom_id, product.uom_id);

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
CREATE TRIGGER stock_moves_before_write
  BEFORE INSERT OR UPDATE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION stock_moves_before_write();
--> statement-breakpoint
-- Nomor lot disimpan tanpa spasi di awal/akhir; lot produk arsip tidak bisa dibuat.
CREATE OR REPLACE FUNCTION lots_before_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NOT (SELECT active FROM products WHERE id = NEW.product_id) THEN
    RAISE EXCEPTION 'Produk sudah diarsipkan.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER lots_before_insert
  BEFORE INSERT ON lots
  FOR EACH ROW EXECUTE FUNCTION lots_before_insert();
--> statement-breakpoint
CREATE TRIGGER transfers_set_updated_at
  BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER stock_moves_set_updated_at
  BEFORE UPDATE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER lots_set_updated_at
  BEFORE UPDATE ON lots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
-- stock_balances dan number_sequences tidak diaudit: keduanya turunan dan berubah di setiap
-- validasi. Riwayat stok ada di stock_moves.
SELECT enable_audit('transfers');
--> statement-breakpoint
SELECT enable_audit('stock_moves');
--> statement-breakpoint
SELECT enable_audit('lots');
