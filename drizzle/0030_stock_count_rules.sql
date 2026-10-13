-- Custom SQL migration file, put your code below! --
-- Stock opname (backlog M2-09, PRD bagian 6.5 dan 9.1).
--
-- Alur: sesi dibuat (status counting) beserta daftar hitung → admin gudang mengisi qty fisik →
-- submit_stock_count() menyimpan qty sistem per cut-off (status review) → approve_stock_count()
-- membuat penyesuaian dari selisihnya, langsung disetujui dan divalidasi (status approved).
-- Perubahan status ke review/approved hanya lewat kedua fungsi itu (penanda app.ledger_write).

-- Saldo satu produk × lokasi × lot pada waktu tertentu, dihitung dari ledger (PRD bagian 6.1).
CREATE OR REPLACE FUNCTION stock_qty_at(
  p_product_id uuid, p_location_id uuid, p_lot_id uuid, p_at timestamptz
) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT coalesce(sum(CASE WHEN destination_location_id = p_location_id THEN qty ELSE -qty END), 0)
  FROM stock_moves
  WHERE status = 'done' AND done_at <= p_at AND product_id = p_product_id
    AND lot_id IS NOT DISTINCT FROM p_lot_id
    AND (destination_location_id = p_location_id OR source_location_id = p_location_id);
$$;
--> statement-breakpoint
-- Lokasi termasuk lingkup sesi: lokasi internal di gudang sesi, dan bila sesi untuk satu lokasi,
-- lokasi itu atau sub-lokasinya.
CREATE OR REPLACE FUNCTION stock_count_covers(p_count_id uuid, p_location_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM stock_counts c
    JOIN locations l ON l.id = p_location_id
    JOIN location_paths lp ON lp.id = l.id
    LEFT JOIN location_paths root ON root.id = c.location_id
    WHERE c.id = p_count_id AND l.warehouse_id = c.warehouse_id AND l.type = 'internal'
      AND (c.location_id IS NULL OR lp.path = root.path OR lp.path LIKE root.path || '/%')
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION stock_counts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  year text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.number, '') = '' THEN
      year := to_char(now() AT TIME ZONE 'Asia/Jakarta', 'YYYY');
      NEW.number := 'OPN/' || year || '/' || lpad(next_number('stock_count', year)::text, 5, '0');
    END IF;
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'counting' THEN
      RAISE EXCEPTION 'Sesi opname baru selalu berstatus Dihitung.';
    END IF;
    IF NOT (SELECT active FROM warehouses WHERE id = NEW.warehouse_id) THEN
      RAISE EXCEPTION 'Gudang sudah diarsipkan.';
    END IF;
    IF NEW.location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM locations
      WHERE id = NEW.location_id AND warehouse_id = NEW.warehouse_id AND type = 'internal' AND active
    ) THEN
      RAISE EXCEPTION 'Lokasi opname harus lokasi internal aktif di gudang yang dipilih.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sesi opname tidak bisa dihapus. Batalkan saja.';
  END IF;
  IF OLD.status IN ('approved', 'cancelled') THEN
    RAISE EXCEPTION 'Sesi opname % sudah % dan tidak bisa diubah.', OLD.number,
      CASE OLD.status WHEN 'approved' THEN 'disetujui' ELSE 'dibatalkan' END;
  END IF;
  IF NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.cut_off_at IS DISTINCT FROM OLD.cut_off_at THEN
    RAISE EXCEPTION 'Gudang, lokasi, dan cut-off sesi opname tidak bisa diubah.';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('review', 'approved')
    AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Status sesi opname hanya bisa diajukan atau disetujui lewat fungsinya.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_counts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON stock_counts
  FOR EACH ROW EXECUTE FUNCTION stock_counts_guard();
--> statement-breakpoint
-- Baris hitung hanya berubah saat sesi masih Dihitung (atau oleh fungsi), lokasinya harus dalam
-- lingkup sesi, dan lot milik produknya.
CREATE OR REPLACE FUNCTION stock_count_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  count_status stock_count_status;
BEGIN
  SELECT status INTO count_status FROM stock_counts
  WHERE id = coalesce(NEW.stock_count_id, OLD.stock_count_id);
  IF count_status IS DISTINCT FROM 'counting' AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Daftar hitung hanya bisa diubah selama sesi opname masih Dihitung.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.location_id <> OLD.location_id)
    AND NOT stock_count_covers(NEW.stock_count_id, NEW.location_id) THEN
    RAISE EXCEPTION 'Lokasi di luar lingkup sesi opname.';
  END IF;
  IF NEW.lot_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND product_id = NEW.product_id) THEN
    RAISE EXCEPTION 'Lot bukan milik produknya.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_count_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION stock_count_lines_guard();
--> statement-breakpoint
-- Ajukan: semua baris harus sudah dihitung; qty sistem per cut-off disimpan di setiap baris.
CREATE OR REPLACE FUNCTION submit_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_count stock_counts%ROWTYPE;
  missing text[];
  missing_total integer;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi opname tidak ditemukan.';
  END IF;
  IF v_count.status <> 'counting' THEN
    RAISE EXCEPTION 'Hanya sesi opname berstatus Dihitung yang bisa diajukan.';
  END IF;

  SELECT count(*) INTO missing_total
  FROM stock_count_lines WHERE stock_count_id = p_count_id AND counted_qty IS NULL;
  IF missing_total > 0 THEN
    SELECT array_agg(item) INTO missing FROM (
      SELECT format('%s di %s', p.sku, lp.path) AS item
      FROM stock_count_lines cl
      JOIN products p ON p.id = cl.product_id
      JOIN location_paths lp ON lp.id = cl.location_id
      WHERE cl.stock_count_id = p_count_id AND cl.counted_qty IS NULL
      ORDER BY lp.path, p.sku
      LIMIT 5
    ) items;
    RAISE EXCEPTION '%', format(
      '%s baris belum dihitung: %s%s. Isi 0 bila barangnya memang tidak ada.',
      missing_total, array_to_string(missing, ', '),
      CASE WHEN missing_total > 5 THEN ', …' ELSE '' END
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM stock_count_lines WHERE stock_count_id = p_count_id) THEN
    RAISE EXCEPTION 'Daftar hitung masih kosong.';
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_count_lines
  SET system_qty = stock_qty_at(product_id, location_id, lot_id, v_count.cut_off_at)
  WHERE stock_count_id = p_count_id;
  UPDATE stock_counts SET status = 'review', submitted_at = now() WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Setujui (PRD bagian 6.5): selisih qty fisik − qty sistem menjadi penyesuaian (satu untuk
-- tambah, satu untuk kurangi), langsung disetujui dan divalidasi dengan tanggal efektif cut-off.
-- Penyesuaian menyimpan stock_count_id sehingga bisa ditelusuri ke sesi ini.
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

    INSERT INTO stock_moves (
      transfer_id, position, product_id, lot_id, input_qty, input_uom_id,
      source_location_id, destination_location_id
    )
    SELECT v_transfer_id, row_number() OVER (ORDER BY lp.path, p.sku), cl.product_id, cl.lot_id,
      abs(cl.counted_qty - cl.system_qty), p.uom_id,
      CASE direction WHEN 'increase' THEN virtual_location ELSE cl.location_id END,
      CASE direction WHEN 'increase' THEN cl.location_id ELSE virtual_location END
    FROM stock_count_lines cl
    JOIN products p ON p.id = cl.product_id
    JOIN location_paths lp ON lp.id = cl.location_id
    WHERE cl.stock_count_id = p_count_id
      AND CASE direction WHEN 'increase' THEN cl.counted_qty > cl.system_qty
                         ELSE cl.counted_qty < cl.system_qty END;

    PERFORM validate_transfer(v_transfer_id, v_count.cut_off_at);
  END LOOP;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'approved', approved_at = now(), approved_by = actor
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_counts_set_updated_at
  BEFORE UPDATE ON stock_counts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER stock_count_lines_set_updated_at
  BEFORE UPDATE ON stock_count_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('stock_counts');
--> statement-breakpoint
SELECT enable_audit('stock_count_lines');
