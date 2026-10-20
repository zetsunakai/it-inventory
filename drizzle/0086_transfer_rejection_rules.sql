-- Custom SQL migration file, put your code below! --
-- Penolakan scrap dan penyesuaian (backlog I-03, product_usage hmx-002): Manajer menolak transfer
-- yang sudah dikonfirmasi dengan alasan wajib; status jadi Ditolak dan pesanan stok dilepas.
-- Transfer Ditolak hanya bisa dikembalikan ke Draft (lalu diperbaiki dan dikonfirmasi lagi) atau
-- dibatalkan.
--
-- Catatan migrasi: nilai enum rejected baru ditambahkan di migrasi sebelumnya, dalam transaksi yang
-- sama, jadi status dibandingkan sebagai teks (status::text) dan semua fungsi di sini plpgsql.
CREATE OR REPLACE FUNCTION reject_transfer(p_transfer_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  transfer transfers%ROWTYPE;
  errors text[] := ARRAY[]::text[];
BEGIN
  transfer := lock_transfer_in(
    p_transfer_id, ARRAY['waiting', 'partially_available', 'ready'],
    'Hanya transfer yang sudah dikonfirmasi dan belum Selesai yang bisa ditolak.'
  );
  IF transfer.type NOT IN ('scrap', 'adjustment') THEN
    errors := errors || 'Transfer ini tidak memerlukan persetujuan.'::text;
  END IF;
  IF actor IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = actor AND role IN ('manajer', 'administrator')
  ) THEN
    errors := errors || 'Hanya Manajer yang bisa menolak.'::text;
  END IF;
  IF coalesce(btrim(p_reason), '') = '' THEN
    errors := errors || 'Alasan penolakan wajib diisi.'::text;
  END IF;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;

  PERFORM unreserve_transfer(p_transfer_id);
  UPDATE transfers
  SET rejected_at = now(), rejected_by = actor, rejection_reason = btrim(p_reason),
    approved_at = NULL, approved_by = NULL
  WHERE id = p_transfer_id;
  PERFORM set_transfer_status(p_transfer_id, 'rejected');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reset_transfer_to_draft(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['waiting', 'partially_available', 'ready', 'rejected'],
    'Hanya transfer yang sudah dikonfirmasi atau ditolak dan belum Selesai yang bisa dikembalikan ke Draft.'
  );
  PERFORM unreserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, 'draft');
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION cancel_transfer(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM lock_transfer_in(
    p_transfer_id, ARRAY['draft', 'waiting', 'partially_available', 'ready', 'rejected'],
    'Transfer yang sudah Selesai atau Batal tidak bisa dibatalkan.'
  );
  PERFORM unreserve_transfer(p_transfer_id);
  PERFORM set_transfer_status(p_transfer_id, 'cancelled');
END;
$$;
--> statement-breakpoint
-- Transfer Ditolak tidak bisa langsung divalidasi atau disetujui: harus kembali ke Draft dulu.
-- Berlaku juga di dalam fungsi database (tanpa melihat app.ledger_write).
CREATE OR REPLACE FUNCTION transfers_rejected_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status::text = 'rejected' AND NEW.status::text NOT IN ('rejected', 'draft', 'cancelled') THEN
    RAISE EXCEPTION 'Transfer % ditolak. Kembalikan ke Draft, perbaiki, lalu konfirmasi lagi.',
      OLD.number;
  END IF;
  IF OLD.status::text = 'rejected' AND NEW.approved_at IS NOT NULL THEN
    RAISE EXCEPTION 'Transfer % ditolak dan tidak bisa disetujui.', OLD.number;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transfers_rejected_guard
  BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION transfers_rejected_guard();
--> statement-breakpoint
-- Sama dengan versi 0058, ditambah penolakan di awal.
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
  -- Transfer yang ditolak Manajer (I-03) harus kembali ke Draft dulu; alasan lain belum relevan.
  IF transfer.status::text = 'rejected' THEN
    RETURN ARRAY[format(
      'Transfer %s ditolak. Kembalikan ke Draft, perbaiki, lalu konfirmasi lagi.', transfer.number
    )];
  END IF;

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
