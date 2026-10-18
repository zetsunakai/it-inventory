-- Form dokumen BC sama persis dengan form hmx (backlog D-09, keputusan user 18/10/2026):
-- pungutan per dokumen (menggantikan pungutan per barang), jaminan, bank devisa, beberapa pemilik
-- barang per dokumen, Dokumen Lartas per barang, kolom lampiran Facility/Izin/Kantor, dan Voluntary
-- Declaration per barang. Tabel dan kolom di bawah dibuat drizzle-kit; aturan, audit, snapshot,
-- duplikat, dan aturan validasi menyusul di bagian akhir.
CREATE TABLE "customs_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"bank_code" text,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_bank_accounts_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_bank_accounts_seq_positive" CHECK ("customs_bank_accounts"."seq" >= 1)
);
--> statement-breakpoint
CREATE TABLE "customs_document_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"levy_type_code" text NOT NULL,
	"rate" numeric(18, 4),
	"amount" numeric(18, 2),
	"status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_document_taxes_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_document_taxes_levy_unique" UNIQUE("document_id","levy_type_code"),
	CONSTRAINT "customs_document_taxes_seq_positive" CHECK ("customs_document_taxes"."seq" >= 1),
	CONSTRAINT "customs_document_taxes_not_negative" CHECK ("customs_document_taxes"."rate" >= 0 and "customs_document_taxes"."amount" >= 0),
	CONSTRAINT "customs_document_taxes_status_valid" CHECK ("customs_document_taxes"."status" in ('uncomputed', 'computed', 'paid'))
);
--> statement-breakpoint
CREATE TABLE "customs_guarantees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type_code" text,
	"number" text,
	"date" date,
	"value" numeric(18, 2),
	"due_date" date,
	"guarantor" text,
	"bpj_number" text,
	"bpj_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customs_guarantees_seq_unique" UNIQUE("document_id","seq"),
	CONSTRAINT "customs_guarantees_seq_positive" CHECK ("customs_guarantees"."seq" >= 1),
	CONSTRAINT "customs_guarantees_value_not_negative" CHECK ("customs_guarantees"."value" >= 0)
);
--> statement-breakpoint
-- Pungutan per barang yang sudah ada dipindah ke pungutan per dokumen: satu baris per jenis,
-- nilai dijumlah, tarif tertinggi.
INSERT INTO customs_document_taxes (document_id, seq, levy_type_code, rate, amount, status)
SELECT document_id, row_number() OVER (PARTITION BY document_id ORDER BY levy_type_code),
  levy_type_code, rate, amount, 'uncomputed'
FROM (
  SELECT l.document_id, t.levy_type_code, max(t.rate) AS rate, sum(t.amount) AS amount
  FROM customs_line_taxes t JOIN customs_document_lines l ON l.id = t.line_id
  GROUP BY l.document_id, t.levy_type_code
) taxes;--> statement-breakpoint
ALTER TABLE "customs_line_taxes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "customs_line_taxes" CASCADE;--> statement-breakpoint
ALTER TABLE "customs_attachments" DROP CONSTRAINT "customs_attachments_seq_unique";--> statement-breakpoint
ALTER TABLE "customs_document_parties" DROP CONSTRAINT "customs_document_parties_role_unique";--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "line_id" uuid;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "facility_code" text;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "permit" text;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD COLUMN "office_code" text;--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD COLUMN "vd_entries" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_document_parties" ADD COLUMN "seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_bank_accounts" ADD CONSTRAINT "customs_bank_accounts_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_document_taxes" ADD CONSTRAINT "customs_document_taxes_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_guarantees" ADD CONSTRAINT "customs_guarantees_document_id_customs_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."customs_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD CONSTRAINT "customs_attachments_line_id_customs_document_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."customs_document_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customs_attachments" ADD CONSTRAINT "customs_attachments_seq_unique" UNIQUE NULLS NOT DISTINCT("document_id","line_id","seq");--> statement-breakpoint
ALTER TABLE "customs_document_parties" ADD CONSTRAINT "customs_document_parties_role_unique" UNIQUE("document_id","entity_type_code","seq");--> statement-breakpoint
ALTER TABLE "customs_document_lines" ADD CONSTRAINT "customs_document_lines_vd_entries_array" CHECK (jsonb_typeof("customs_document_lines"."vd_entries") = 'array');--> statement-breakpoint
ALTER TABLE "customs_document_parties" ADD CONSTRAINT "customs_document_parties_seq_positive" CHECK ("customs_document_parties"."seq" >= 1);--> statement-breakpoint
CREATE TRIGGER customs_document_taxes_set_updated_at BEFORE UPDATE ON customs_document_taxes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER customs_guarantees_set_updated_at BEFORE UPDATE ON customs_guarantees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER customs_bank_accounts_set_updated_at BEFORE UPDATE ON customs_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
SELECT enable_audit('customs_document_taxes');--> statement-breakpoint
SELECT enable_audit('customs_guarantees');--> statement-breakpoint
SELECT enable_audit('customs_bank_accounts');--> statement-breakpoint
-- Ikut terkunci bersama dokumennya (M3-11).
CREATE TRIGGER customs_document_taxes_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_document_taxes FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_guarantees_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_guarantees FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
CREATE TRIGGER customs_bank_accounts_guard BEFORE INSERT OR UPDATE OR DELETE
  ON customs_bank_accounts FOR EACH ROW EXECUTE FUNCTION customs_parts_guard();--> statement-breakpoint
-- Lampiran per barang (Dokumen Lartas) harus milik barang dokumen yang sama.
CREATE OR REPLACE FUNCTION customs_attachments_line_check() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customs_document_lines WHERE id = NEW.line_id AND document_id = NEW.document_id
  ) THEN
    RAISE EXCEPTION 'Dokumen Lartas harus milik barang dokumen yang sama.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER customs_attachments_line_check BEFORE INSERT OR UPDATE OF line_id, document_id
  ON customs_attachments FOR EACH ROW EXECUTE FUNCTION customs_attachments_line_check();
--> statement-breakpoint
-- Pungutan per barang sudah tidak ada; bagian lain dibaca dari document_id.
CREATE OR REPLACE FUNCTION customs_parts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
  doc customs_documents%ROWTYPE;
BEGIN
  IF customs_status_write_enabled() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT * INTO doc FROM customs_documents WHERE id = (row_data ->> 'document_id')::uuid;
  IF FOUND AND customs_document_locked(doc.status) THEN
    RAISE EXCEPTION 'Dokumen BC % sudah % dan tidak bisa diubah.', doc.aju_number,
      customs_status_label(doc.status);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
-- Snapshot revisi (M3-12) dengan bagian baru: pungutan, jaminan, bank devisa, dan lampiran per
-- barang (attachments dengan line_id).
CREATE OR REPLACE FUNCTION customs_document_snapshot(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'document', to_jsonb(d),
    'parties', coalesce((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.entity_type_code, p.seq)
      FROM customs_document_parties p WHERE p.document_id = d.id), '[]'),
    'lines', coalesce((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object('sku', pr.sku, 'product_name', pr.name)
        ORDER BY l.seq)
      FROM customs_document_lines l JOIN products pr ON pr.id = l.product_id
      WHERE l.document_id = d.id), '[]'),
    'attachments', coalesce((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.line_id NULLS FIRST, a.seq)
      FROM customs_attachments a WHERE a.document_id = d.id), '[]'),
    'packages', coalesce((
      SELECT jsonb_agg(to_jsonb(k) ORDER BY k.seq)
      FROM customs_packages k WHERE k.document_id = d.id), '[]'),
    'containers', coalesce((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.seq)
      FROM customs_containers c WHERE c.document_id = d.id), '[]'),
    'transports', coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.seq)
      FROM customs_transports t WHERE t.document_id = d.id), '[]'),
    'taxes', coalesce((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.seq)
      FROM customs_document_taxes t WHERE t.document_id = d.id), '[]'),
    'guarantees', coalesce((
      SELECT jsonb_agg(to_jsonb(g) ORDER BY g.seq)
      FROM customs_guarantees g WHERE g.document_id = d.id), '[]'),
    'bank_accounts', coalesce((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.seq)
      FROM customs_bank_accounts b WHERE b.document_id = d.id), '[]'))
  FROM customs_documents d WHERE d.id = p_id;
$$;
--> statement-breakpoint
-- Duplikat (M3-13) dengan bagian baru. Lampiran dan Dokumen Lartas disalin tanpa file.
CREATE OR REPLACE FUNCTION duplicate_customs_document(p_id uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  source customs_documents%ROWTYPE;
  new_id uuid;
  line record;
  new_line uuid;
BEGIN
  SELECT * INTO source FROM customs_documents WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumen BC tidak ditemukan.';
  END IF;

  INSERT INTO customs_documents (
    doc_code, customs_office_code, currency_code, ndpbm, cif_value, fob_value, freight_value,
    insurance_value, delivery_price, gross_weight, net_weight, signer_name, signer_position,
    signer_city, signed_date, details, notes)
  VALUES (
    source.doc_code, source.customs_office_code, source.currency_code, source.ndpbm,
    source.cif_value, source.fob_value, source.freight_value, source.insurance_value,
    source.delivery_price, source.gross_weight, source.net_weight, source.signer_name,
    source.signer_position, source.signer_city, source.signed_date, source.details, source.notes)
  RETURNING id INTO new_id;

  INSERT INTO customs_document_parties (
    document_id, entity_type_code, seq, partner_id, name, address, country_code,
    identity_type_code, identity_number, nib, permit_number, permit_date, details)
  SELECT new_id, entity_type_code, seq, partner_id, name, address, country_code,
    identity_type_code, identity_number, nib, permit_number, permit_date, details
  FROM customs_document_parties WHERE document_id = p_id;

  -- Produk yang sudah diarsipkan atau tidak punya kode HS lagi ditolak trigger baris barang.
  FOR line IN SELECT * FROM customs_document_lines WHERE document_id = p_id ORDER BY seq LOOP
    INSERT INTO customs_document_lines (
      document_id, seq, product_id, item_code, hs_code, description, brand, item_type, item_size,
      specification, qty, ceisa_unit_code, stock_qty, package_qty, package_type_code, net_weight,
      origin_country_code, unit_price, invoice_value, cif_value, fob_value, freight_value,
      insurance_value, delivery_price, customs_value, details, vd_entries)
    VALUES (
      new_id, line.seq, line.product_id, line.item_code, line.hs_code, line.description,
      line.brand, line.item_type, line.item_size, line.specification, line.qty,
      line.ceisa_unit_code, line.stock_qty, line.package_qty, line.package_type_code,
      line.net_weight, line.origin_country_code, line.unit_price, line.invoice_value,
      line.cif_value, line.fob_value, line.freight_value, line.insurance_value,
      line.delivery_price, line.customs_value, line.details, line.vd_entries)
    RETURNING id INTO new_line;
    INSERT INTO customs_attachments (document_id, line_id, seq, document_type_code, number, date,
      facility_code, permit, office_code)
    SELECT new_id, new_line, seq, document_type_code, number, date, facility_code, permit,
      office_code
    FROM customs_attachments WHERE line_id = line.id;
  END LOOP;

  INSERT INTO customs_attachments (document_id, seq, document_type_code, number, date,
    facility_code, permit, office_code)
  SELECT new_id, seq, document_type_code, number, date, facility_code, permit, office_code
  FROM customs_attachments WHERE document_id = p_id AND line_id IS NULL;
  INSERT INTO customs_packages (document_id, seq, qty, package_type_code, marks)
  SELECT new_id, seq, qty, package_type_code, marks FROM customs_packages WHERE document_id = p_id;
  INSERT INTO customs_containers (document_id, seq, number, size_code, type_code, load_type_code)
  SELECT new_id, seq, number, size_code, type_code, load_type_code
  FROM customs_containers WHERE document_id = p_id;
  INSERT INTO customs_transports (document_id, seq, transport_mode_code, name, voyage_number,
    flag_country_code)
  SELECT new_id, seq, transport_mode_code, name, voyage_number, flag_country_code
  FROM customs_transports WHERE document_id = p_id;
  INSERT INTO customs_document_taxes (document_id, seq, levy_type_code, rate, amount, status)
  SELECT new_id, seq, levy_type_code, rate, amount, status
  FROM customs_document_taxes WHERE document_id = p_id;
  INSERT INTO customs_guarantees (document_id, seq, type_code, number, date, value, due_date,
    guarantor, bpj_number, bpj_date)
  SELECT new_id, seq, type_code, number, date, value, due_date, guarantor, bpj_number, bpj_date
  FROM customs_guarantees WHERE document_id = p_id;
  INSERT INTO customs_bank_accounts (document_id, seq, bank_code, code)
  SELECT new_id, seq, bank_code, code FROM customs_bank_accounts WHERE document_id = p_id;

  PERFORM refresh_customs_document_status(new_id);
  RETURN new_id;
END;
$$;
--> statement-breakpoint
-- Aturan validasi mengikuti form hmx: label pesan sama dengan label field di form, dan aturan untuk
-- field yang tidak ada di form hmx jenis itu dihapus (mis. Nilai CIF per barang BC 2.3).
UPDATE doc_validation_rules r SET label = v.label
FROM (VALUES
  ('23', 'header', 'customs_office_code', 'Kantor Pabean Pengawasan'),
  ('23', 'party', '7', 'Pemilik Barang'),
  ('23', 'header', 'currency_code', 'Jenis Valuta'),
  ('23', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('23', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('23', 'details', 'loadingPortCode', 'Pelabuhan Muat'),
  ('23', 'details', 'unloadingPortCode', 'Pelabuhan Bongkar'),
  ('23', 'details', 'tpsCode', 'Tempat Penimbunan'),
  ('23', 'transport', 'transport_mode_code', 'Cara Pengangkutan'),
  ('23', 'transport', 'name', 'Nama Sarana Angkut'),
  ('23', 'header', 'signer_name', 'Nama Penandatangan'),
  ('23', 'header', 'signer_position', 'Jabatan'),
  ('23', 'header', 'signer_city', 'Tempat'),
  ('23', 'header', 'signed_date', 'Tanggal'),
  ('23', 'line', 'hs_code', 'HS'),
  ('23', 'line', 'description', 'Uraian Jenis Barang'),
  ('23', 'line', 'qty', 'Jumlah Satuan'),
  ('23', 'line', 'ceisa_unit_code', 'Kode Satuan'),
  ('23', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('23', 'line', 'origin_country_code', 'Negara Asal Barang'),
  ('40', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('40', 'party', '7', 'Pemilik Barang'),
  ('40', 'party', '9', 'Pengirim Barang'),
  ('40', 'header', 'delivery_price', 'Harga Penyerahan/Harga Jual'),
  ('40', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('40', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('40', 'header', 'signer_name', 'Nama Penandatangan'),
  ('40', 'header', 'signer_position', 'Jabatan'),
  ('40', 'header', 'signer_city', 'Tempat'),
  ('40', 'header', 'signed_date', 'Tanggal'),
  ('40', 'line', 'hs_code', 'HS'),
  ('40', 'line', 'description', 'Uraian Jenis Barang'),
  ('40', 'line', 'ceisa_unit_code', 'Satuan'),
  ('40', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('40', 'line', 'delivery_price', 'Harga Penyerahan/Harga Jual'),
  ('25', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('25', 'party', '7', 'Pemilik Barang'),
  ('25', 'party', '8', 'Penerima Barang'),
  ('25', 'header', 'currency_code', 'Jenis Valuta'),
  ('25', 'header', 'delivery_price', 'Harga Penyerahan / Harga Jual / Harga Barang'),
  ('25', 'details', 'deliveryReasonCode', 'Alasan Pengiriman'),
  ('25', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('25', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('25', 'header', 'signer_name', 'Nama Penandatangan'),
  ('25', 'header', 'signer_position', 'Jabatan'),
  ('25', 'header', 'signer_city', 'Tempat'),
  ('25', 'header', 'signed_date', 'Tanggal'),
  ('25', 'line', 'hs_code', 'HS'),
  ('25', 'line', 'description', 'Uraian Jenis Barang'),
  ('25', 'line', 'qty', 'Jumlah Satuan'),
  ('25', 'line', 'ceisa_unit_code', 'Kode Satuan'),
  ('25', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('25', 'line', 'cif_value', 'CIF'),
  ('25', 'line', 'delivery_price', 'Harga Barang'),
  ('30', 'header', 'customs_office_code', 'Kantor Pabean Muat'),
  ('30', 'header', 'currency_code', 'Jenis Valuta'),
  ('30', 'header', 'fob_value', 'Jumlah Nilai Ekspor (FOB)'),
  ('30', 'details', 'incotermCode', 'Cara Penyerahan Barang'),
  ('30', 'header', 'gross_weight', 'Berat Kotor (Kg)'),
  ('30', 'header', 'net_weight', 'Berat Bersih (Kg)'),
  ('30', 'details', 'loadingPortCode', 'Pelabuhan Muat Asal'),
  ('30', 'details', 'destinationPortCode', 'Pelabuhan Tujuan'),
  ('30', 'details', 'destinationCountryCode', 'Negara Tujuan'),
  ('30', 'transport', 'transport_mode_code', 'Cara Pengangkutan'),
  ('30', 'transport', 'name', 'Nama Sarana Angkut'),
  ('30', 'header', 'signer_name', 'Nama Penandatangan'),
  ('30', 'header', 'signer_position', 'Jabatan'),
  ('30', 'header', 'signer_city', 'Tempat'),
  ('30', 'header', 'signed_date', 'Tanggal Pernyataan'),
  ('30', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('30', 'line', 'description', 'Uraian Jenis Barang'),
  ('30', 'line', 'qty', 'Jumlah Barang'),
  ('30', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('30', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('30', 'line', 'fob_value', 'FOB'),
  ('41', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('41', 'party', '7', 'Pemilik Barang'),
  ('41', 'party', '8', 'Penerima Barang'),
  ('41', 'header', 'delivery_price', 'Harga Penyerahan'),
  ('41', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('41', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('41', 'header', 'signer_name', 'Nama Penandatangan'),
  ('41', 'header', 'signer_position', 'Jabatan'),
  ('41', 'header', 'signer_city', 'Tempat'),
  ('41', 'header', 'signed_date', 'Tanggal'),
  ('41', 'line', 'hs_code', 'HS'),
  ('41', 'line', 'description', 'Uraian Jenis Barang'),
  ('41', 'line', 'ceisa_unit_code', 'Satuan'),
  ('41', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('41', 'line', 'delivery_price', 'Harga Penyerahan/Harga Jual'),
  ('20', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('20', 'party', '7', 'Pemilik Barang'),
  ('20', 'header', 'currency_code', 'Jenis Valuta'),
  ('20', 'details', 'importTypeCode', 'Jenis Impor'),
  ('20', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('20', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('20', 'details', 'loadingPortCode', 'Pelabuhan Muat'),
  ('20', 'details', 'unloadingPortCode', 'Pelabuhan Bongkar'),
  ('20', 'details', 'tpsCode', 'Tempat Penimbunan'),
  ('20', 'transport', 'transport_mode_code', 'Cara Pengangkutan'),
  ('20', 'transport', 'name', 'Nama Sarana Angkut'),
  ('20', 'header', 'signer_name', 'Nama Penandatangan'),
  ('20', 'header', 'signer_position', 'Jabatan'),
  ('20', 'header', 'signer_city', 'Tempat'),
  ('20', 'header', 'signed_date', 'Tanggal'),
  ('20', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('20', 'line', 'description', 'Uraian Jenis Barang'),
  ('20', 'line', 'qty', 'Jumlah Barang'),
  ('20', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('20', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('20', 'line', 'origin_country_code', 'Negara Asal Barang'),
  ('261', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('261', 'party', '3', 'Pengusaha'),
  ('261', 'party', '7', 'Pemilik'),
  ('261', 'header', 'currency_code', 'Jenis Valuta'),
  ('261', 'details', 'temporaryReasonCode', 'Tujuan Pengiriman'),
  ('261', 'header', 'gross_weight', 'Berat Kotor'),
  ('261', 'header', 'net_weight', 'Berat Bersih'),
  ('261', 'header', 'signer_name', 'Nama Penandatangan'),
  ('261', 'header', 'signer_position', 'Jabatan'),
  ('261', 'header', 'signer_city', 'Tempat'),
  ('261', 'header', 'signed_date', 'Tanggal'),
  ('261', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('261', 'line', 'description', 'Uraian Jenis Barang'),
  ('261', 'line', 'qty', 'Jumlah Barang'),
  ('261', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('261', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('262', 'header', 'customs_office_code', 'Kantor Pabean'),
  ('262', 'party', '3', 'Pengusaha'),
  ('262', 'party', '7', 'Pemilik'),
  ('262', 'header', 'currency_code', 'Jenis Valuta'),
  ('262', 'details', 'temporaryReasonCode', 'Tujuan Pemasukan'),
  ('262', 'header', 'gross_weight', 'Berat Kotor'),
  ('262', 'header', 'net_weight', 'Berat Bersih'),
  ('262', 'header', 'signer_name', 'Nama Penandatangan'),
  ('262', 'header', 'signer_position', 'Jabatan'),
  ('262', 'header', 'signer_city', 'Tempat'),
  ('262', 'header', 'signed_date', 'Tanggal'),
  ('262', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('262', 'line', 'description', 'Uraian Jenis Barang'),
  ('262', 'line', 'qty', 'Jumlah Barang'),
  ('262', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('262', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('27', 'header', 'customs_office_code', 'Kantor Pabean Asal'),
  ('27', 'party', '7', 'Pemilik Barang'),
  ('27', 'party', '8', 'Penerima Barang'),
  ('27', 'header', 'currency_code', 'Jenis Valuta'),
  ('27', 'details', 'destinationOfficeCode', 'Kantor Pabean Tujuan'),
  ('27', 'details', 'deliveryReasonCode', 'Alasan Pengiriman'),
  ('27', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('27', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('27', 'header', 'signer_name', 'Nama Penandatangan'),
  ('27', 'header', 'signer_position', 'Jabatan'),
  ('27', 'header', 'signer_city', 'Tempat'),
  ('27', 'header', 'signed_date', 'Tanggal'),
  ('27', 'line', 'hs_code', 'HS'),
  ('27', 'line', 'description', 'Uraian Jenis Barang'),
  ('27', 'line', 'qty', 'Jumlah Satuan'),
  ('27', 'line', 'ceisa_unit_code', 'Kode Satuan'),
  ('27', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('27', 'line', 'cif_value', 'CIF'),
  ('16', 'header', 'customs_office_code', 'Kantor Pabean Pengawasan'),
  ('16', 'party', '3', 'Pengusaha TPB'),
  ('16', 'party', '7', 'Pemilik Barang'),
  ('16', 'header', 'currency_code', 'Jenis Valuta'),
  ('16', 'details', 'plbWarehouseCode', 'Kode Gudang PLB'),
  ('16', 'header', 'gross_weight', 'Berat Kotor (Kg)'),
  ('16', 'header', 'net_weight', 'Berat Bersih (Kg)'),
  ('16', 'details', 'loadingPortCode', 'Pelabuhan Muat'),
  ('16', 'details', 'unloadingPortCode', 'Pelabuhan Bongkar'),
  ('16', 'transport', 'transport_mode_code', 'Cara Pengangkutan'),
  ('16', 'transport', 'name', 'Nama Sarana Angkut'),
  ('16', 'header', 'signer_name', 'Nama Penandatangan'),
  ('16', 'header', 'signer_position', 'Jabatan'),
  ('16', 'header', 'signer_city', 'Tempat'),
  ('16', 'header', 'signed_date', 'Tanggal Pernyataan'),
  ('16', 'line', 'hs_code', 'HS'),
  ('16', 'line', 'description', 'Uraian Jenis Barang'),
  ('16', 'line', 'qty', 'Jumlah'),
  ('16', 'line', 'ceisa_unit_code', 'Satuan'),
  ('16', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('16', 'line', 'origin_country_code', 'Negara Asal Barang'),
  ('28', 'header', 'customs_office_code', 'Kantor Pabean Muat'),
  ('28', 'party', '3', 'Pengusaha'),
  ('28', 'party', '7', 'Pemilik'),
  ('28', 'header', 'currency_code', 'Jenis Valuta'),
  ('28', 'details', 'importTypeCode', 'Jenis Impor'),
  ('28', 'header', 'gross_weight', 'Berat Kotor'),
  ('28', 'header', 'net_weight', 'Berat Bersih'),
  ('28', 'details', 'plbWarehouseCode', 'Kode Gudang PLB'),
  ('28', 'header', 'signer_name', 'Nama Penandatangan'),
  ('28', 'header', 'signer_position', 'Jabatan'),
  ('28', 'header', 'signer_city', 'Tempat'),
  ('28', 'header', 'signed_date', 'Tanggal'),
  ('28', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('28', 'line', 'description', 'Uraian Jenis Barang'),
  ('28', 'line', 'qty', 'Jumlah Barang'),
  ('28', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('28', 'line', 'origin_country_code', 'Negara'),
  ('33', 'header', 'customs_office_code', 'Kantor Pabean Muat'),
  ('33', 'party', '2', 'Exportir'),
  ('33', 'party', '3', 'Pengusaha'),
  ('33', 'header', 'currency_code', 'Jenis Valuta'),
  ('33', 'header', 'fob_value', 'Nilai Ekspor FOB'),
  ('33', 'details', 'exportTypeCode', 'Jenis Ekspor'),
  ('33', 'details', 'incotermCode', 'Cara Penyerahan Barang'),
  ('33', 'header', 'gross_weight', 'Berat Kotor'),
  ('33', 'header', 'net_weight', 'Berat Bersih'),
  ('33', 'details', 'loadingPortCode', 'Pelabuhan Muat Asal'),
  ('33', 'details', 'destinationPortCode', 'Pelabuhan Tujuan'),
  ('33', 'transport', 'transport_mode_code', 'Cara Pengangkutan'),
  ('33', 'transport', 'name', 'Sarana Pengangkut'),
  ('33', 'header', 'signer_name', 'Nama Penandatangan'),
  ('33', 'header', 'signer_position', 'Jabatan'),
  ('33', 'header', 'signer_city', 'Tempat'),
  ('33', 'header', 'signed_date', 'Tanggal Pernyataan'),
  ('33', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('33', 'line', 'description', 'Uraian Jenis Barang'),
  ('33', 'line', 'qty', 'Jumlah Barang'),
  ('33', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('33', 'line', 'net_weight', 'Berat Bersih (Kg)'),
  ('33', 'line', 'fob_value', 'FOB'),
  ('331', 'header', 'customs_office_code', 'Kantor Pabean Muat'),
  ('331', 'party', '8', 'Penerima Barang'),
  ('331', 'header', 'gross_weight', 'Berat Kotor (KGM)'),
  ('331', 'header', 'net_weight', 'Berat Bersih (KGM)'),
  ('331', 'details', 'plbWarehouseCode', 'Kode Gudang PLB'),
  ('331', 'details', 'loadingPortCode', 'Pelabuhan Muat'),
  ('331', 'details', 'destinationPortCode', 'Pelabuhan Tujuan'),
  ('331', 'details', 'destinationCountryCode', 'Negara Tujuan'),
  ('331', 'transport', 'transport_mode_code', 'Moda'),
  ('331', 'transport', 'name', 'Nama Sarana Angkut'),
  ('331', 'header', 'signer_name', 'Nama Penandatangan'),
  ('331', 'header', 'signer_position', 'Jabatan'),
  ('331', 'header', 'signer_city', 'Tempat'),
  ('331', 'header', 'signed_date', 'Tanggal'),
  ('331', 'line', 'hs_code', 'Pos Tarif/HS'),
  ('331', 'line', 'description', 'Uraian Jenis Barang'),
  ('331', 'line', 'qty', 'Jumlah Barang'),
  ('331', 'line', 'ceisa_unit_code', 'Satuan Barang'),
  ('331', 'line', 'net_weight', 'Berat Bersih (Kg)')
) AS v(doc_code, target, field, label)
WHERE r.doc_code::text = v.doc_code AND r.target::text = v.target AND r.field = v.field;
--> statement-breakpoint
DELETE FROM doc_validation_rules r
USING (VALUES
  ('23', 'details', 'insuranceTypeCode'),
  ('23', 'line', 'cif_value'),
  ('20', 'header', 'cif_value'),
  ('20', 'line', 'cif_value'),
  ('16', 'line', 'cif_value'),
  ('28', 'header', 'cif_value'),
  ('28', 'line', 'net_weight'),
  ('28', 'line', 'cif_value'),
  ('33', 'details', 'destinationCountryCode')
) AS v(doc_code, target, field)
WHERE r.doc_code::text = v.doc_code AND r.target::text = v.target AND r.field = v.field;
