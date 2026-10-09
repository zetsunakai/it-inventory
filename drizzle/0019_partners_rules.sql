-- Custom SQL migration file, put your code below! --
-- Aturan partner yang dipaksakan di database (PRD bagian 5.1, backlog M1-06).

ALTER TABLE partners
  ADD CONSTRAINT partners_text_not_blank CHECK (
    btrim(code) <> '' AND btrim(name) <> '' AND btrim(address) <> '' AND btrim(identity_number) <> ''
  ),
  ADD CONSTRAINT partners_has_role CHECK (is_vendor OR is_customer),
  -- Format nomor per jenis identitas (IDENTITY_RULES di src/lib/partner.ts).
  ADD CONSTRAINT partners_identity_number_format CHECK (
    CASE identity_type
      WHEN 'npwp16' THEN identity_number ~ '^[0-9]{16}$'
      WHEN 'npwp15' THEN identity_number ~ '^[0-9]{15}$'
      WHEN 'ktp' THEN identity_number ~ '^[0-9]{16}$'
      WHEN 'passport' THEN identity_number ~ '^[A-Z0-9]{5,20}$'
      ELSE true
    END
  ),
  -- NITKU wajib untuk NPWP (22 digit, diawali NPWP 16 digit; NPWP 15 digit diberi awalan 0)
  -- dan harus kosong untuk jenis identitas lain.
  ADD CONSTRAINT partners_nitku_by_identity CHECK (
    CASE identity_type
      WHEN 'npwp16' THEN nitku ~ '^[0-9]{22}$' AND left(nitku, 16) = identity_number
      WHEN 'npwp15' THEN nitku ~ '^[0-9]{22}$' AND left(nitku, 16) = '0' || identity_number
      ELSE nitku IS NULL
    END
  );
--> statement-breakpoint
-- Kode partner tidak bisa diubah: dipakai sebagai kunci import dan acuan dokumen.
CREATE OR REPLACE FUNCTION partners_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Kode partner tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER partners_guard
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION partners_guard();
--> statement-breakpoint
CREATE TRIGGER partners_set_updated_at
  BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('partners');
