-- Custom SQL migration file, put your code below! --
-- Aturan tanggal dan tutup periode (backlog I-06, transfer.py hmx-002):
-- 1. Tanggal rencana tidak boleh sebelum hari ini (WIB) untuk transfer yang masih dibentuk user
--    (Draft dan Menunggu), saat disimpan maupun saat Konfirmasi. Transfer turunan (lanjutan,
--    retur/pengganti, antar gudang, penyesuaian opname) mewarisi tanggal asalnya, jadi dikecualikan.
-- 2. Tanggal efektif di masa depan sudah ditolak transfer_validation_errors() (PRD 6.4).
-- 3. Semua alasan periode belum bisa ditutup dikumpulkan period_close_errors(), dipakai
--    close_period() dan halaman Tutup periode.

-- Transfer turunan dokumen lain (_has_derived_transfer_provenance hmx).
CREATE OR REPLACE FUNCTION transfer_is_derived(p_transfer transfers) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_transfer.backorder_of_id IS NOT NULL OR p_transfer.return_of_id IS NOT NULL
    OR p_transfer.return_request_id IS NOT NULL OR p_transfer.interwarehouse_id IS NOT NULL
    OR p_transfer.stock_count_id IS NOT NULL;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfer_scheduled_date_errors(p_transfer transfers) RETURNS text[]
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_transfer.scheduled_date < (now() AT TIME ZONE 'Asia/Jakarta')::date
      AND NOT transfer_is_derived(p_transfer)
    THEN ARRAY['Tanggal rencana tidak boleh sebelum hari ini.']
    ELSE ARRAY[]::text[]
  END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION transfers_scheduled_date_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  errors text[];
BEGIN
  IF ledger_write_enabled() OR NEW.status::text NOT IN ('draft', 'waiting') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.scheduled_date IS NOT DISTINCT FROM OLD.scheduled_date THEN
    RETURN NEW;
  END IF;
  errors := transfer_scheduled_date_errors(NEW);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_scheduled_date_guard
  BEFORE INSERT OR UPDATE OF scheduled_date ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_scheduled_date_guard();
--> statement-breakpoint
-- Sama dengan versi 0055, ditambah aturan tanggal rencana.
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
  errors := errors || transfer_scheduled_date_errors(transfer);
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
-- Semua alasan satu periode belum bisa ditutup (I-06). Kosong = bisa ditutup.
CREATE OR REPLACE FUNCTION period_close_errors(p_year integer, p_month integer) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  errors text[] := ARRAY[]::text[];
  period_from timestamptz;
  period_until timestamptz;
  label text := lpad(p_month::text, 2, '0') || '/' || p_year;
  line record;
BEGIN
  IF p_month NOT BETWEEN 1 AND 12 THEN
    RETURN ARRAY['Bulan tidak valid.'];
  END IF;
  period_from := period_start(p_year, p_month);
  period_until := period_end(p_year, p_month);
  IF EXISTS (SELECT 1 FROM inventory_periods WHERE year = p_year AND month = p_month) THEN
    RETURN ARRAY[format('Periode %s sudah ditutup.', label)];
  END IF;
  IF period_until > now() THEN
    errors := errors || format('Periode %s belum berakhir.', label);
  END IF;
  -- Berurutan: bulan sebelumnya harus sudah ditutup, kecuali belum ada pergerakan sama sekali
  -- sebelum periode ini (periode pertama).
  IF EXISTS (SELECT 1 FROM stock_moves WHERE status = 'done' AND done_at < period_from)
    AND NOT EXISTS (SELECT 1 FROM inventory_periods WHERE period_end(year, month) = period_from)
  THEN
    errors := errors || format('Tutup dulu periode %s/%s.',
      lpad((CASE p_month WHEN 1 THEN 12 ELSE p_month - 1 END)::text, 2, '0'),
      CASE p_month WHEN 1 THEN p_year - 1 ELSE p_year END);
  END IF;
  -- Opname yang mulai hitung di periode ini dan belum selesai: penyesuaiannya akan bertanggal di
  -- periode ini, jadi harus disetujui atau dibatalkan dulu.
  FOR line IN
    SELECT c.number, w.code FROM stock_counts c JOIN warehouses w ON w.id = c.warehouse_id
    WHERE c.status::text IN ('counting', 'counted', 'review')
      AND c.cut_off_at >= period_from AND c.cut_off_at < period_until
    ORDER BY c.number
  LOOP
    errors := errors || format(
      'Stock opname %s (%s) belum disetujui atau dibatalkan; selisihnya akan bertanggal di periode ini.',
      line.number, line.code);
  END LOOP;
  RETURN errors;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION close_period(p_year integer, p_month integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  period_from timestamptz;
  period_until timestamptz;
  errors text[];
  previous_flag text := coalesce(current_setting('app.ledger_write', true), '');
BEGIN
  IF actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Periode hanya bisa ditutup Manajer.';
  END IF;
  -- Kunci daftar periode supaya dua penutupan tidak berjalan bersamaan.
  LOCK TABLE inventory_periods IN SHARE ROW EXCLUSIVE MODE;
  errors := period_close_errors(p_year, p_month);
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  period_from := period_start(p_year, p_month);
  period_until := period_end(p_year, p_month);

  PERFORM set_config('app.ledger_write', 'on', true);
  INSERT INTO period_balances (
    year, month, product_id, warehouse_id, category,
    opening_qty, in_qty, out_qty, adjustment_qty, closing_qty
  )
  SELECT p_year, p_month, product_id, warehouse_id, category,
    coalesce(sum(delta) FILTER (WHERE done_at < period_from), 0),
    coalesce(sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'in'), 0),
    coalesce(-sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'out'), 0),
    coalesce(sum(delta) FILTER (WHERE done_at >= period_from AND kind = 'adjustment'), 0),
    coalesce(sum(delta), 0)
  FROM warehouse_movements(period_until)
  GROUP BY product_id, warehouse_id, category
  HAVING sum(delta) FILTER (WHERE done_at < period_from) <> 0
    OR count(*) FILTER (WHERE done_at >= period_from) > 0;

  INSERT INTO inventory_periods (year, month, closed_by) VALUES (p_year, p_month, actor);
  PERFORM set_config('app.ledger_write', previous_flag, true);
END;
$$;
