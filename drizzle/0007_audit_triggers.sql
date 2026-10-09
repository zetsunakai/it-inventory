-- Custom SQL migration file, put your code below! --
-- Audit log generik (PRD bagian 11).
--
-- User pelaku dibaca dari setting transaksi app.user_id, yang diisi aplikasi
-- lewat withAuditUser() / pola mutasi standar. Kosong = perubahan oleh sistem.
--
-- Argumen trigger: [0] kolom primary key (default 'id'),
--                  [1] array kolom yang disamarkan dari log (rahasia).
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  pk_column text := coalesce(TG_ARGV[0], 'id');
  redacted text[] := coalesce(TG_ARGV[1], '{}')::text[];
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  old_row jsonb;
  new_row jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD) - redacted; END IF;
  IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW) - redacted; END IF;

  -- Update yang hanya mengubah updated_at (atau kolom rahasia) tidak dicatat.
  IF TG_OP = 'UPDATE' AND (old_row - 'updated_at') = (new_row - 'updated_at') THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  VALUES (actor, TG_TABLE_NAME, coalesce(new_row, old_row) ->> pk_column, TG_OP, old_row, new_row);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Pasang audit pada satu tabel. Dipanggil dari migrasi:
--   SELECT enable_audit('products');
--   SELECT enable_audit('accounts', 'id', '{password}');
CREATE OR REPLACE FUNCTION enable_audit(target regclass, pk_column text DEFAULT 'id', redact text[] DEFAULT '{}')
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_row_change ON %s', target);
  EXECUTE format(
    'CREATE TRIGGER audit_row_change AFTER INSERT OR UPDATE OR DELETE ON %s '
    'FOR EACH ROW EXECUTE FUNCTION audit_row_change(%L, %L)',
    target, pk_column, redact::text
  );
END;
$$;
--> statement-breakpoint
-- audit_logs hanya boleh ditambah.
CREATE OR REPLACE FUNCTION audit_logs_block_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs hanya boleh ditambah: % tidak diizinkan', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_change();
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_block_change();
--> statement-breakpoint
-- Tabel yang diaudit sejauh ini. sessions dan verifications sengaja tidak
-- (data sementara dan sangat sering berubah).
SELECT enable_audit('users');
--> statement-breakpoint
SELECT enable_audit('user_roles', 'user_id');
--> statement-breakpoint
SELECT enable_audit('system_settings', 'key');
--> statement-breakpoint
SELECT enable_audit('accounts', 'id', '{password,access_token,refresh_token,id_token}');
--> statement-breakpoint
SELECT enable_audit('two_factors', 'id', '{secret,backup_codes}');
