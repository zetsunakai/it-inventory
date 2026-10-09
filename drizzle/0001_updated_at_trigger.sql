-- Custom SQL migration file, put your code below! --
-- Fungsi trigger generik: isi updated_at setiap kali baris di-update.
-- Tabel baru cukup menambahkan trigger BEFORE UPDATE yang memanggil fungsi ini.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER system_settings_set_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
