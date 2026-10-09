-- Custom SQL migration file, put your code below! --
-- Aturan profil perusahaan yang dipaksakan di database (PRD bagian 5.1 dan 11).

-- Hanya satu baris: primary key boolean yang selalu true.
ALTER TABLE company ADD CONSTRAINT company_single_row CHECK (id);
--> statement-breakpoint
-- Format nomor resmi, hanya angka: NPWP 16, NITKU 22 (diawali NPWP), NIB 13.
ALTER TABLE company
  ADD CONSTRAINT company_npwp_format CHECK (npwp ~ '^[0-9]{16}$'),
  ADD CONSTRAINT company_nitku_format CHECK (nitku ~ '^[0-9]{22}$' AND left(nitku, 16) = npwp),
  ADD CONSTRAINT company_nib_format CHECK (nib ~ '^[0-9]{13}$'),
  ADD CONSTRAINT company_text_not_blank CHECK (
    btrim(name) <> '' AND btrim(address) <> '' AND btrim(permit_number) <> ''
  );
--> statement-breakpoint
CREATE TRIGGER company_set_updated_at
  BEFORE UPDATE ON company
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('company');
