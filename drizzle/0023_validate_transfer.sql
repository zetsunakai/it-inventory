-- Custom SQL migration file, put your code below! --
-- Validasi transfer dan penguncian ledger (backlog M2-02, PRD bagian 6.3, 6.4, 8.4, 11, 12.3).
--
-- Satu-satunya jalan transfer menjadi Selesai adalah validate_transfer(). Fungsi itu menyalakan
-- penanda transaksi app.ledger_write; trigger di bawah menolak tulisan ke saldo dan perubahan
-- status ke Selesai tanpa penanda itu, dan menolak perubahan apa pun pada data yang sudah Selesai.
-- Penanda ini pengaman terhadap kesalahan kode aplikasi, bukan batas keamanan: aplikasi dan
-- fungsi memakai user database yang sama.

-- Gudang non-berikat boleh stok negatif bila diizinkan pengaturan ini (PRD bagian 6.4).
-- Gudang berikat tidak pernah boleh.
INSERT INTO system_settings (key, value, description)
VALUES (
  'inventory.allow_negative_stock',
  'false',
  'Izinkan stok negatif di gudang non-berikat (true/false)'
)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ledger_write_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.ledger_write', true), '') = 'on';
$$;
--> statement-breakpoint
-- Gerbang dokumen BC (PRD bagian 8.4): daftar alasan transfer belum boleh Selesai.
-- Titik sambung untuk M4; sampai dokumen BC ada, gerbang belum memeriksa apa pun.
CREATE OR REPLACE FUNCTION customs_gate_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT ARRAY[]::text[];
$$;
--> statement-breakpoint
-- Validasi transfer: semua syarat diperiksa dulu dan semua alasan gagal dilaporkan sekaligus
-- (satu alasan per baris pesan). Bila lolos, dalam transaksi yang sama: baris pergerakan menjadi
-- Selesai beserta salinan kategori produknya, saldo diperbarui, dan transfer dikunci.
--
-- p_done_at = tanggal efektif; kosong = sekarang. Tanggal lebih awal dari hari ini (backdate)
-- hanya untuk Manajer; tanggal di masa depan ditolak. Batas periode tertutup menyusul di M2-10.
CREATE OR REPLACE FUNCTION validate_transfer(p_transfer_id uuid, p_done_at timestamptz DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  effective_at timestamptz := coalesce(p_done_at, now());
  today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  allow_negative boolean;
  errors text[] := ARRAY[]::text[];
  line record;
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;
  IF transfer.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Transfer % sudah %.', transfer.number,
      CASE transfer.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM stock_moves WHERE transfer_id = p_transfer_id) THEN
    errors := errors || 'Transfer belum punya baris barang.'::text;
  END IF;

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
  IF (effective_at AT TIME ZONE 'Asia/Jakarta')::date > today THEN
    errors := errors || 'Tanggal efektif tidak boleh di masa depan.'::text;
  ELSIF (effective_at AT TIME ZONE 'Asia/Jakarta')::date < today AND NOT (
    actor IS NULL OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = actor AND role = 'manajer')
  ) THEN
    errors := errors || 'Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer.'::text;
  END IF;

  -- Scrap dan penyesuaian: alasan wajib dan harus disetujui Manajer (PRD bagian 6.2).
  IF transfer.type IN ('scrap', 'adjustment') THEN
    IF coalesce(btrim(transfer.reason), '') = '' THEN
      errors := errors || 'Alasan wajib diisi.'::text;
    END IF;
    IF transfer.approved_at IS NULL THEN
      errors := errors || 'Belum disetujui Manajer.'::text;
    END IF;
  END IF;

  -- Produk wajib lot (PRD bagian 6.4).
  FOR line IN
    SELECT DISTINCT p.sku
    FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = p_transfer_id AND p.lot_required AND m.lot_id IS NULL
    ORDER BY p.sku
  LOOP
    errors := errors || format('Produk %s wajib diisi nomor lot.', line.sku);
  END LOOP;

  -- Stok cukup di lokasi asal (PRD bagian 6.4): selalu di gudang berikat, di gudang non-berikat
  -- kecuali pengaturan mengizinkan. Saldo dikunci supaya validasi bersamaan tidak lolos berdua.
  SELECT coalesce((value #>> '{}')::boolean, false) INTO allow_negative
  FROM system_settings WHERE key = 'inventory.allow_negative_stock';
  FOR line IN
    WITH needed AS (
      SELECT m.product_id, m.source_location_id, m.lot_id, sum(m.qty) AS qty
      FROM stock_moves m
      WHERE m.transfer_id = p_transfer_id
      GROUP BY m.product_id, m.source_location_id, m.lot_id
    ),
    locked AS (
      SELECT b.product_id, b.location_id, b.lot_id, b.qty
      FROM stock_balances b
      JOIN needed n ON n.product_id = b.product_id AND n.source_location_id = b.location_id
        AND n.lot_id IS NOT DISTINCT FROM b.lot_id
      FOR UPDATE OF b
    )
    SELECT p.sku, l.code AS location, lot.name AS lot, n.qty AS needed,
      coalesce(k.qty, 0) AS available
    FROM needed n
    JOIN products p ON p.id = n.product_id
    JOIN locations l ON l.id = n.source_location_id
    JOIN warehouses w ON w.id = l.warehouse_id
    LEFT JOIN lots lot ON lot.id = n.lot_id
    LEFT JOIN locked k ON k.product_id = n.product_id AND k.location_id = n.source_location_id
      AND k.lot_id IS NOT DISTINCT FROM n.lot_id
    WHERE coalesce(k.qty, 0) < n.qty AND (w.is_bonded OR NOT allow_negative)
    ORDER BY p.sku, l.code
  LOOP
    errors := errors || format(
      'Stok %s%s di %s tidak cukup: tersedia %s, dibutuhkan %s.',
      line.sku, coalesce(' lot ' || line.lot, ''), line.location,
      replace(trim_scale(line.available)::text, '.', ','),
      replace(trim_scale(line.needed)::text, '.', ',')
    );
  END LOOP;

  errors := errors || customs_gate_errors(p_transfer_id);

  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);

  UPDATE stock_moves m
  SET status = 'done', done_at = effective_at, category = p.category
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

  UPDATE transfers
  SET status = 'done', done_at = effective_at, done_by = actor
  WHERE id = p_transfer_id;

  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
--> statement-breakpoint
-- Saldo hanya ditulis validate_transfer().
CREATE OR REPLACE FUNCTION stock_balances_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Saldo stok hanya bisa berubah lewat validasi transfer.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_balances_guard
  BEFORE INSERT OR UPDATE OR DELETE ON stock_balances
  FOR EACH ROW EXECUTE FUNCTION stock_balances_guard();
--> statement-breakpoint
-- Transfer Selesai dan Batal terkunci (PRD bagian 6.3 dan 11). Koreksi selalu lewat transaksi
-- baru: retur atau penyesuaian. Status Selesai hanya dari validate_transfer().
CREATE OR REPLACE FUNCTION transfers_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('done', 'cancelled') THEN
      RAISE EXCEPTION 'Transfer % sudah % dan tidak bisa dihapus.', OLD.number,
        CASE OLD.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'done' THEN
    RAISE EXCEPTION 'Transfer % sudah Selesai dan tidak bisa diubah. Koreksi lewat retur atau penyesuaian.',
      OLD.number;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'Transfer % sudah Batal dan tidak bisa diubah.', OLD.number;
  END IF;
  IF NEW.status = 'done' AND NOT ledger_write_enabled() THEN
    RAISE EXCEPTION 'Transfer hanya bisa Selesai lewat validasi.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_lock
  BEFORE INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_lock();
--> statement-breakpoint
-- Baris pergerakan transfer yang dibatalkan ikut Batal.
CREATE OR REPLACE FUNCTION transfers_cancel_moves() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  PERFORM set_config('app.ledger_write', 'on', true);
  UPDATE stock_moves SET status = 'cancelled' WHERE transfer_id = NEW.id;
  PERFORM set_config('app.ledger_write', previous_flag, true);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_cancel_moves
  AFTER UPDATE OF status ON transfers
  FOR EACH ROW WHEN (NEW.status = 'cancelled' AND OLD.status <> 'cancelled')
  EXECUTE FUNCTION transfers_cancel_moves();
--> statement-breakpoint
-- Baris pergerakan: Selesai tidak bisa diubah atau dihapus; baris transfer Selesai/Batal tidak bisa
-- ditambah, diubah, atau dihapus; status Selesai/Batal hanya dari fungsi.
CREATE OR REPLACE FUNCTION stock_moves_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  transfer_status transfer_status;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status = 'done' THEN
    RAISE EXCEPTION 'Baris pergerakan yang sudah Selesai tidak bisa diubah atau dihapus.';
  END IF;
  IF ledger_write_enabled() THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  SELECT status INTO transfer_status FROM transfers
  WHERE id = coalesce(NEW.transfer_id, OLD.transfer_id);
  -- Transfer sudah terhapus: baris ikut terhapus lewat ON DELETE CASCADE.
  IF TG_OP = 'DELETE' AND transfer_status IS NULL THEN
    RETURN OLD;
  END IF;
  IF transfer_status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Baris barang transfer yang sudah % tidak bisa diubah.',
      CASE transfer_status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.status <> 'draft' THEN
    RAISE EXCEPTION 'Status baris pergerakan hanya bisa diubah lewat validasi transfer.';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_moves_lock
  BEFORE INSERT OR UPDATE OR DELETE ON stock_moves
  FOR EACH ROW EXECUTE FUNCTION stock_moves_lock();
