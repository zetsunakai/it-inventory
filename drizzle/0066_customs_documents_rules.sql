-- Custom SQL migration file, put your code below! --
-- Aturan skema dokumen BC (backlog M3-01, PRD bagian 7 dan 13). Nomor aju (M3-02), aturan
-- validasi (M3-03), alur status dan penguncian (M3-11), serta gerbang transfer (M4) menyusul.

-- Arah dokumen (PRD 7.1): BC 2.3 dan 4.0 masuk, BC 2.5, 3.0, dan 4.1 keluar. Sama dengan
-- CUSTOMS_DOC_DIRECTIONS di src/modules/it-inventory/lib/customs.ts.
CREATE OR REPLACE FUNCTION customs_doc_direction(p_doc_code customs_doc_code)
RETURNS movement_direction
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_doc_code
    WHEN '23' THEN 'in'
    WHEN '40' THEN 'in'
    ELSE 'out'
  END::movement_direction;
$$;
--> statement-breakpoint
-- Dokumen baru selalu Draft dan pembuatnya diisi dari app.user_id. Jenis dokumen tidak bisa
-- diubah setelah dibuat.
CREATE OR REPLACE FUNCTION customs_documents_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := nullif(current_setting('app.user_id', true), '')::uuid;
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Dokumen BC baru selalu berstatus Draft.';
    END IF;
  ELSIF NEW.doc_code <> OLD.doc_code THEN
    RAISE EXCEPTION 'Jenis dokumen BC tidak bisa diubah.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_documents_before_write
  BEFORE INSERT OR UPDATE ON customs_documents
  FOR EACH ROW EXECUTE FUNCTION customs_documents_before_write();
--> statement-breakpoint
-- Baris barang hanya untuk produk aktif yang siap dokumen BC (punya kode HS, PRD 5.3). Kategori
-- IT Inventory selalu disalin dari produk; product code, kode HS, dan uraian diisi dari produk
-- bila dikosongkan.
CREATE OR REPLACE FUNCTION customs_document_lines_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.product_id <> OLD.product_id THEN
    SELECT * INTO product FROM products WHERE id = NEW.product_id;
    IF NOT product.active THEN
      RAISE EXCEPTION 'Produk % sudah diarsipkan.', product.sku;
    END IF;
    IF NOT product.customs_ready THEN
      RAISE EXCEPTION 'Produk % belum siap dokumen BC: kode HS belum diisi.', product.sku;
    END IF;
    NEW.category := product.category;
    NEW.item_code := coalesce(NEW.item_code, product.sku);
    NEW.hs_code := coalesce(NEW.hs_code, product.hs_code);
    NEW.description := coalesce(NEW.description, product.name);
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_document_lines_before_write
  BEFORE INSERT OR UPDATE ON customs_document_lines
  FOR EACH ROW EXECUTE FUNCTION customs_document_lines_before_write();
--> statement-breakpoint
CREATE TRIGGER customs_documents_set_updated_at
  BEFORE UPDATE ON customs_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_document_parties_set_updated_at
  BEFORE UPDATE ON customs_document_parties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_document_lines_set_updated_at
  BEFORE UPDATE ON customs_document_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_line_taxes_set_updated_at
  BEFORE UPDATE ON customs_line_taxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_attachments_set_updated_at
  BEFORE UPDATE ON customs_attachments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_packages_set_updated_at
  BEFORE UPDATE ON customs_packages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_containers_set_updated_at
  BEFORE UPDATE ON customs_containers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
CREATE TRIGGER customs_transports_set_updated_at
  BEFORE UPDATE ON customs_transports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('customs_documents');
--> statement-breakpoint
SELECT enable_audit('customs_document_parties');
--> statement-breakpoint
SELECT enable_audit('customs_document_lines');
--> statement-breakpoint
SELECT enable_audit('customs_line_taxes');
--> statement-breakpoint
SELECT enable_audit('customs_attachments');
--> statement-breakpoint
SELECT enable_audit('customs_packages');
--> statement-breakpoint
SELECT enable_audit('customs_containers');
--> statement-breakpoint
SELECT enable_audit('customs_transports');
