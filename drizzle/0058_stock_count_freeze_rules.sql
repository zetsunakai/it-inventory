-- Custom SQL migration file, put your code below! --
-- Stock opname dengan pembekuan gudang (backlog R-13, PRD bagian 6.5, mengikuti stock_count dan
-- stock_warehouse_freeze hmx-002):
--   Draft (lingkup: gudang, opsional lokasi dan kategori produk) →
--   Mulai hitung: daftar hitung dan qty sistem diambil dari saldo saat itu, gudang dibekukan →
--   Selesai hitung (semua baris terisi; bisa dihitung ulang) → Ajukan → Menunggu persetujuan →
--   Disetujui: selisih jadi penyesuaian bertanggal selesai hitung, gudang dibuka.
--   Ditolak kembali ke Selesai hitung; Batal (sebelum disetujui) membuka gudang.
-- Selama dibekukan (Berjalan, Selesai hitung, Menunggu persetujuan) transfer yang menyentuh gudang
-- itu tidak bisa divalidasi, kecuali penyesuaian dari sesi itu sendiri. Satu gudang hanya punya
-- satu opname yang membekukan.
-- Nilai enum draft/counted baru ditambahkan di migrasi sebelumnya dalam transaksi yang sama, jadi
-- di sini hanya dipakai di dalam fungsi plpgsql (dievaluasi saat dijalankan) atau lewat ::text.

-- Data lama: sesi Dihitung (sekarang Berjalan) mengambil qty sistem per cut-off-nya; sesi
-- Menunggu persetujuan dianggap selesai hitung saat diajukan.
ALTER TABLE stock_count_lines DISABLE TRIGGER USER;
--> statement-breakpoint
UPDATE stock_count_lines cl
SET system_qty = stock_qty_at(cl.product_id, cl.location_id, cl.lot_id, c.cut_off_at)
FROM stock_counts c
WHERE c.id = cl.stock_count_id AND c.status::text = 'counting' AND cl.system_qty IS NULL;
--> statement-breakpoint
ALTER TABLE stock_count_lines ENABLE TRIGGER USER;
--> statement-breakpoint
ALTER TABLE stock_counts DISABLE TRIGGER USER;
--> statement-breakpoint
UPDATE stock_counts SET completed_at = submitted_at
WHERE status::text IN ('review', 'approved') AND completed_at IS NULL;
--> statement-breakpoint
ALTER TABLE stock_counts ENABLE TRIGGER USER;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_stock_count_status(p_count_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = p_status::stock_count_status WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Produk termasuk lingkup kategori sesi (kategori itu atau sub-kategorinya); tanpa kategori = semua.
CREATE OR REPLACE FUNCTION stock_count_covers_product(p_count_id uuid, p_product_id uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT c.product_category_id IS NULL OR EXISTS (
    SELECT 1
    FROM products p
    JOIN product_category_paths pp ON pp.id = p.category_id
    JOIN product_category_paths root ON root.id = c.product_category_id
    WHERE p.id = p_product_id AND (pp.path = root.path OR pp.path LIKE root.path || ' / %')
  )
  FROM stock_counts c WHERE c.id = p_count_id;
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
    NEW.status := coalesce(NEW.status::text, 'draft')::stock_count_status;
    IF NEW.status::text <> 'draft' THEN
      RAISE EXCEPTION 'Sesi opname baru selalu berstatus Draft.';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sesi opname tidak bisa dihapus. Batalkan saja.';
  ELSE
    IF OLD.status::text IN ('approved', 'cancelled') THEN
      RAISE EXCEPTION 'Sesi opname % sudah % dan tidak bisa diubah.', OLD.number,
        CASE OLD.status::text WHEN 'approved' THEN 'disetujui' ELSE 'dibatalkan' END;
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Status sesi opname hanya berubah lewat tombol alurnya (mulai, selesai hitung, ajukan, setujui, tolak, batal).';
    END IF;
    IF NEW.cut_off_at IS DISTINCT FROM OLD.cut_off_at AND NOT ledger_write_enabled() THEN
      RAISE EXCEPTION 'Waktu mulai hitung sesi opname tidak bisa diubah.';
    END IF;
    IF (NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
      OR NEW.location_id IS DISTINCT FROM OLD.location_id
      OR NEW.product_category_id IS DISTINCT FROM OLD.product_category_id)
      AND OLD.status::text <> 'draft' THEN
      RAISE EXCEPTION 'Lingkup sesi opname hanya bisa diubah selama Draft.';
    END IF;
    IF NEW.warehouse_id IS NOT DISTINCT FROM OLD.warehouse_id
      AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
      AND NEW.product_category_id IS NOT DISTINCT FROM OLD.product_category_id THEN
      RETURN NEW;
    END IF;
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
  IF NEW.product_category_id IS NOT NULL
    AND NOT (SELECT active FROM product_categories WHERE id = NEW.product_category_id) THEN
    RAISE EXCEPTION 'Kategori produk sudah diarsipkan.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Baris hitung: hanya berubah saat sesi Berjalan (atau oleh fungsi), lokasi dan produk dalam
-- lingkup sesi, lot milik produknya. Qty sistem baris baru (barang temuan) = saldo saat ini; selama
-- gudang dibekukan saldo itu tidak berubah.
CREATE OR REPLACE FUNCTION stock_count_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  count_status text;
BEGIN
  SELECT status::text INTO count_status FROM stock_counts
  WHERE id = coalesce(NEW.stock_count_id, OLD.stock_count_id);
  IF count_status IS DISTINCT FROM 'counting' AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Daftar hitung hanya bisa diubah selama sesi opname Berjalan.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.location_id <> OLD.location_id)
    AND NOT stock_count_covers(NEW.stock_count_id, NEW.location_id) THEN
    RAISE EXCEPTION 'Lokasi di luar lingkup sesi opname.';
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id)
    AND NOT stock_count_covers_product(NEW.stock_count_id, NEW.product_id) THEN
    RAISE EXCEPTION 'Produk di luar kategori sesi opname.';
  END IF;
  IF NEW.lot_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lots WHERE id = NEW.lot_id AND product_id = NEW.product_id) THEN
    RAISE EXCEPTION 'Lot bukan milik produknya.';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.system_qty IS NULL THEN
    NEW.system_qty := coalesce((
      SELECT qty FROM stock_balances
      WHERE product_id = NEW.product_id AND location_id = NEW.location_id
        AND lot_id IS NOT DISTINCT FROM NEW.lot_id
    ), 0);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION lock_stock_count_in(p_count_id uuid, p_statuses text[], p_message text)
RETURNS stock_counts
LANGUAGE plpgsql AS $$
DECLARE
  v_count stock_counts%ROWTYPE;
BEGIN
  SELECT * INTO v_count FROM stock_counts WHERE id = p_count_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesi opname tidak ditemukan.';
  END IF;
  IF NOT v_count.status::text = ANY (p_statuses) THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
  RETURN v_count;
END;
$$;
--> statement-breakpoint
-- Mulai hitung: gudang dikunci dulu supaya dua sesi tidak mulai bersamaan, lalu daftar hitung
-- diisi dari saldo di lingkup sesi dengan qty sistem saat ini.
CREATE OR REPLACE FUNCTION start_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_count stock_counts%ROWTYPE;
  running text;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  v_count := lock_stock_count_in(
    p_count_id, ARRAY['draft'], 'Hanya sesi opname Draft yang bisa mulai dihitung.'
  );
  PERFORM 1 FROM warehouses WHERE id = v_count.warehouse_id FOR UPDATE;
  SELECT number INTO running FROM stock_counts
  WHERE warehouse_id = v_count.warehouse_id AND id <> p_count_id
    AND status::text IN ('counting', 'counted', 'review')
  LIMIT 1;
  IF running IS NOT NULL THEN
    RAISE EXCEPTION 'Gudang % sudah punya stock opname berjalan: %. Selesaikan atau batalkan dulu.',
      (SELECT code FROM warehouses WHERE id = v_count.warehouse_id), running;
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'counting'::text::stock_count_status, cut_off_at = now()
  WHERE id = p_count_id;
  INSERT INTO stock_count_lines (stock_count_id, product_id, location_id, lot_id, system_qty)
  SELECT p_count_id, b.product_id, b.location_id, b.lot_id, b.qty
  FROM stock_balances b
  WHERE b.qty <> 0 AND stock_count_covers(p_count_id, b.location_id)
    AND stock_count_covers_product(p_count_id, b.product_id);
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Selesai hitung: semua baris harus sudah dihitung.
CREATE OR REPLACE FUNCTION complete_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  missing text[];
  missing_total integer;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM lock_stock_count_in(
    p_count_id, ARRAY['counting'], 'Hanya sesi opname Berjalan yang bisa diselesaikan hitungnya.'
  );
  IF NOT EXISTS (SELECT 1 FROM stock_count_lines WHERE stock_count_id = p_count_id) THEN
    RAISE EXCEPTION 'Daftar hitung masih kosong.';
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
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'counted'::text::stock_count_status, completed_at = now()
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Hitung ulang: Selesai hitung kembali ke Berjalan.
CREATE OR REPLACE FUNCTION reopen_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM lock_stock_count_in(
    p_count_id, ARRAY['counted'], 'Hanya sesi opname Selesai hitung yang bisa dihitung ulang.'
  );
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'counting'::text::stock_count_status, completed_at = NULL
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
DROP FUNCTION submit_stock_count(uuid);
--> statement-breakpoint
-- Ajukan persetujuan: Selesai hitung → Menunggu persetujuan.
CREATE OR REPLACE FUNCTION submit_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM lock_stock_count_in(
    p_count_id, ARRAY['counted'], 'Hanya sesi opname Selesai hitung yang bisa diajukan.'
  );
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'review', submitted_at = now() WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Tolak (Manajer): Menunggu persetujuan kembali ke Selesai hitung.
CREATE OR REPLACE FUNCTION reject_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM lock_stock_count_in(
    p_count_id, ARRAY['review'], 'Hanya sesi opname yang menunggu persetujuan yang bisa ditolak.'
  );
  IF actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Sesi opname hanya bisa ditolak Manajer.';
  END IF;
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'counted'::text::stock_count_status, submitted_at = NULL
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Batal: sebelum disetujui; gudang langsung dibuka.
CREATE OR REPLACE FUNCTION cancel_stock_count(p_count_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM lock_stock_count_in(
    p_count_id, ARRAY['draft', 'counting', 'counted', 'review'],
    'Sesi opname yang sudah disetujui atau dibatalkan tidak bisa dibatalkan.'
  );
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'cancelled', cancelled_at = now() WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Setujui (PRD bagian 6.5): selisih qty fisik − qty sistem menjadi penyesuaian (satu untuk tambah,
-- satu untuk kurangi) yang langsung disetujui dan divalidasi dengan tanggal efektif selesai hitung.
-- Penyesuaian menyimpan stock_count_id, jadi lolos dari pembekuan gudang sesi ini.
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
  v_count := lock_stock_count_in(
    p_count_id, ARRAY['review'], 'Hanya sesi opname yang menunggu persetujuan yang bisa disetujui.'
  );
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

    PERFORM validate_transfer(v_transfer_id, coalesce(v_count.completed_at, v_count.cut_off_at));
  END LOOP;

  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_counts SET status = 'approved', approved_at = now(), approved_by = actor
  WHERE id = p_count_id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Gudang yang dibekukan opname, untuk pesan validasi transfer.
CREATE OR REPLACE FUNCTION stock_count_freeze_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT format(
    'Gudang %s sedang dibekukan untuk stock opname %s. Transfer bisa divalidasi setelah opnamenya disetujui atau dibatalkan.',
    w.code, c.number
  )), ARRAY[]::text[])
  FROM transfers t
  JOIN stock_moves m ON m.transfer_id = t.id
  JOIN stock_counts c ON c.warehouse_id IN (m.source_warehouse_id, m.destination_warehouse_id)
  JOIN warehouses w ON w.id = c.warehouse_id
  WHERE t.id = p_transfer_id AND c.status::text IN ('counting', 'counted', 'review')
    AND t.stock_count_id IS DISTINCT FROM c.id;
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

  -- Gudang yang sedang di-opname dibekukan (R-13).
  errors := errors || stock_count_freeze_errors(p_transfer_id);

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
