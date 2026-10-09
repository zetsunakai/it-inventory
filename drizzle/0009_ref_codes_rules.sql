-- Custom SQL migration file, put your code below! --
-- Aturan ref_codes yang dipaksakan di database (PRD bagian 5.2 dan 11).

-- Kode dan nama tidak boleh kosong atau hanya spasi.
ALTER TABLE ref_codes
  ADD CONSTRAINT ref_codes_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT ref_codes_name_not_blank CHECK (btrim(name) <> '');
--> statement-breakpoint
-- parent_code wajib untuk jenis yang kodenya unik per induk (REF_CODE_PARENT_TYPES
-- di src/lib/ref-codes.ts) dan harus kosong untuk jenis lain.
ALTER TABLE ref_codes
  ADD CONSTRAINT ref_codes_parent_code_by_type CHECK (
    (type IN ('tps', 'foreign_port')) = (parent_code IS NOT NULL)
  );
--> statement-breakpoint
CREATE TRIGGER ref_codes_set_updated_at
  BEFORE UPDATE ON ref_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('ref_codes');
