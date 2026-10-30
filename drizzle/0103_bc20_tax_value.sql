ALTER TABLE "customs_document_taxes" ALTER COLUMN "levy_type_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD COLUMN "tax_value" text;--> statement-breakpoint
-- Jenis hanya boleh kosong pada BC 2.0; kontrak dokumen lain tetap dijaga database.
CREATE FUNCTION customs_document_taxes_type_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.levy_type_code IS NULL AND
    (SELECT doc_code FROM customs_documents WHERE id = NEW.document_id) <> '20' THEN
    RAISE EXCEPTION 'Jenis pungutan wajib dipilih.';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER customs_document_taxes_type_check
  BEFORE INSERT OR UPDATE ON customs_document_taxes
  FOR EACH ROW EXECUTE FUNCTION customs_document_taxes_type_check();
