-- Custom SQL migration file, put your code below! --
-- Pindah lokasi (backlog R-09, PRD bagian 6.2): transfer internal antar dua lokasi internal hanya
-- di dalam satu gudang. Barang antar gudang dipindah lewat lokasi transit (R-10). Transfer lama
-- antar gudang yang sudah ada tidak terpengaruh (trigger hanya memeriksa saat lokasi diisi/diganti).

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
      WHEN 'internal' THEN CASE
        WHEN src.type = 'internal' AND dst.type = 'internal'
          THEN 'Pindah lokasi hanya di dalam satu gudang. Barang antar gudang dipindah lewat lokasi transit.'
        ELSE 'Transfer internal harus antar lokasi internal atau transit.'
      END
      WHEN 'scrap' THEN 'Scrap harus dari lokasi internal gudang ke lokasi scrap.'
      WHEN 'adjustment' THEN 'Penyesuaian harus antara lokasi penyesuaian dan lokasi internal gudang.'
      ELSE 'Retur harus kebalikan arah transfer asalnya.'
    END;
  END IF;
  RETURN NEW;
END;
$$;
