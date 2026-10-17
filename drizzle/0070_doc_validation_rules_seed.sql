-- Custom SQL migration file, put your code below! --
-- Aturan validasi kelengkapan dokumen BC (backlog M3-03, PRD bagian 7.2 dan 7.6). Field wajib
-- disimpan sebagai data per doc_code; customs_document_errors() melaporkan semua kekurangan
-- sekaligus. Seed awal diambil dari check_required_fields() Equip3 (baris yang dikomentari di sana
-- tidak diambil) dan PRD 7.2: invoice wajib untuk semua jenis, pengangkutan wajib untuk BC 2.3 dan
-- BC 3.0. Kunci details memakai camelCase, sama dengan form (M3-04 dan seterusnya).

-- field harus menunjuk ke kolom yang ada untuk bagian berupa tabel, supaya salah ketik tidak
-- membuat aturan yang tidak pernah terpenuhi.
CREATE OR REPLACE FUNCTION doc_validation_rules_before_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_table text := CASE NEW.target
    WHEN 'header' THEN 'customs_documents'
    WHEN 'line' THEN 'customs_document_lines'
    WHEN 'transport' THEN 'customs_transports'
    WHEN 'package' THEN 'customs_packages'
    WHEN 'container' THEN 'customs_containers'
  END;
BEGIN
  IF target_table IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = target_table AND column_name = NEW.field
  ) THEN
    RAISE EXCEPTION 'Kolom % tidak ada di %.', NEW.field, target_table;
  END IF;
  IF NEW.target IN ('details', 'party', 'attachment') AND btrim(NEW.field) = '' THEN
    RAISE EXCEPTION 'Field aturan validasi wajib diisi.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER doc_validation_rules_before_write
  BEFORE INSERT OR UPDATE ON doc_validation_rules
  FOR EACH ROW EXECUTE FUNCTION doc_validation_rules_before_write();
--> statement-breakpoint
CREATE TRIGGER doc_validation_rules_set_updated_at
  BEFORE UPDATE ON doc_validation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
--> statement-breakpoint
SELECT enable_audit('doc_validation_rules');
--> statement-breakpoint
-- Nilai kosong: null, teks kosong/spasi, atau objek/array JSON kosong.
CREATE OR REPLACE FUNCTION customs_value_missing(p_value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_value IS NULL OR p_value = 'null'::jsonb
    OR (jsonb_typeof(p_value) = 'string' AND btrim(p_value #>> '{}') = '');
$$;
--> statement-breakpoint
-- Daftar kekurangan dokumen, satu pesan per field, urut sesuai position aturan. Kosong = lengkap.
CREATE OR REPLACE FUNCTION customs_document_errors(p_document_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  doc customs_documents%ROWTYPE;
  doc_json jsonb;
  rule doc_validation_rules%ROWTYPE;
  line record;
  errors text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO doc FROM customs_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dokumen BC tidak ditemukan.';
  END IF;
  doc_json := to_jsonb(doc);

  IF NOT EXISTS (SELECT 1 FROM customs_document_lines WHERE document_id = doc.id) THEN
    errors := errors || 'Dokumen belum punya barang.'::text;
  END IF;

  FOR rule IN
    SELECT * FROM doc_validation_rules
    WHERE doc_code = doc.doc_code AND active
    ORDER BY position, label
  LOOP
    CASE rule.target
      WHEN 'header' THEN
        IF customs_value_missing(doc_json -> rule.field) THEN
          errors := errors || format('%s belum diisi.', rule.label);
        END IF;
      WHEN 'details' THEN
        IF customs_value_missing(doc.details -> rule.field) THEN
          errors := errors || format('%s belum diisi.', rule.label);
        END IF;
      WHEN 'party' THEN
        IF NOT EXISTS (
          SELECT 1 FROM customs_document_parties
          WHERE document_id = doc.id AND entity_type_code = rule.field
        ) THEN
          errors := errors || format('Entitas %s belum diisi.', rule.label);
        END IF;
      WHEN 'attachment' THEN
        IF NOT EXISTS (
          SELECT 1 FROM customs_attachments
          WHERE document_id = doc.id AND document_type_code = rule.field
        ) THEN
          errors := errors || format('Lampiran %s belum ada.', rule.label);
        END IF;
      WHEN 'line' THEN
        FOR line IN
          SELECT seq, to_jsonb(l) AS data FROM customs_document_lines l
          WHERE document_id = doc.id ORDER BY seq
        LOOP
          IF customs_value_missing(line.data -> rule.field) THEN
            errors := errors || format('Barang seri %s: %s belum diisi.', line.seq, rule.label);
          END IF;
        END LOOP;
      ELSE
        -- Pengangkutan, kemasan, peti kemas: minimal satu baris yang field-nya terisi.
        IF NOT EXISTS (
          SELECT 1 FROM (
            SELECT to_jsonb(t) AS data FROM customs_transports t
            WHERE rule.target = 'transport' AND document_id = doc.id
            UNION ALL
            SELECT to_jsonb(p) FROM customs_packages p
            WHERE rule.target = 'package' AND document_id = doc.id
            UNION ALL
            SELECT to_jsonb(c) FROM customs_containers c
            WHERE rule.target = 'container' AND document_id = doc.id
          ) rows
          WHERE NOT customs_value_missing(rows.data -> rule.field)
        ) THEN
          errors := errors || format('%s: %s belum diisi.',
            CASE rule.target WHEN 'transport' THEN 'Pengangkutan'
              WHEN 'package' THEN 'Kemasan' ELSE 'Peti kemas' END,
            rule.label);
        END IF;
    END CASE;
  END LOOP;
  RETURN errors;
END;
$$;
--> statement-breakpoint
INSERT INTO doc_validation_rules (doc_code, target, field, label, position)
SELECT d.doc_code::customs_doc_code, r.target::customs_rule_target, r.field, r.label, r.position
FROM (VALUES ('23'), ('40'), ('25'), ('30'), ('41')) AS d(doc_code)
CROSS JOIN (VALUES
  -- Semua jenis: header, penandatangan, berat, invoice, dan rincian barang.
  ('header', 'customs_office_code', 'Kantor pabean', 10),
  ('header', 'gross_weight', 'Berat kotor', 40),
  ('header', 'net_weight', 'Berat bersih', 41),
  ('header', 'signer_name', 'Nama penandatangan', 90),
  ('header', 'signer_position', 'Jabatan penandatangan', 91),
  ('header', 'signer_city', 'Kota pernyataan', 92),
  ('header', 'signed_date', 'Tanggal pernyataan', 93),
  ('attachment', '380', 'Invoice', 80),
  ('package', 'package_type_code', 'Jenis kemasan', 70),
  ('line', 'hs_code', 'Kode HS', 100),
  ('line', 'description', 'Uraian barang', 101),
  ('line', 'qty', 'Jumlah satuan', 102),
  ('line', 'ceisa_unit_code', 'Satuan CEISA', 103),
  ('line', 'stock_qty', 'Jumlah dalam satuan stok', 104),
  ('line', 'net_weight', 'Berat bersih', 105)
) AS r(target, field, label, position)
UNION ALL
SELECT r.doc_code::customs_doc_code, r.target::customs_rule_target, r.field, r.label, r.position
FROM (VALUES
  -- BC 2.3: impor ke TPB.
  ('23', 'party', '3', 'Pengusaha TPB', 20),
  ('23', 'party', '7', 'Pemilik barang', 21),
  ('23', 'party', '5', 'Pemasok', 22),
  ('23', 'header', 'currency_code', 'Valuta', 30),
  ('23', 'header', 'ndpbm', 'NDPBM', 31),
  ('23', 'header', 'cif_value', 'Nilai CIF', 32),
  ('23', 'header', 'freight_value', 'Freight', 33),
  ('23', 'details', 'insuranceTypeCode', 'Jenis asuransi', 34),
  ('23', 'details', 'loadingPortCode', 'Pelabuhan muat', 50),
  ('23', 'details', 'unloadingPortCode', 'Pelabuhan bongkar', 51),
  ('23', 'details', 'tpsCode', 'Tempat penimbunan sementara', 52),
  ('23', 'details', 'bc11Number', 'Nomor BC 1.1', 53),
  ('23', 'details', 'bc11Date', 'Tanggal BC 1.1', 54),
  ('23', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('23', 'transport', 'name', 'Nama sarana angkut', 61),
  ('23', 'line', 'origin_country_code', 'Negara asal', 106),
  ('23', 'line', 'cif_value', 'Nilai CIF', 107),
  -- BC 4.0: pemasukan dari TLDDP.
  ('40', 'party', '3', 'Pengusaha TPB', 20),
  ('40', 'party', '7', 'Pemilik barang', 21),
  ('40', 'party', '9', 'Pengirim', 22),
  ('40', 'header', 'delivery_price', 'Harga penyerahan', 30),
  ('40', 'line', 'delivery_price', 'Harga penyerahan', 106),
  -- BC 2.5: pengeluaran ke TLDDP.
  ('25', 'party', '3', 'Pengusaha TPB', 20),
  ('25', 'party', '7', 'Pemilik barang', 21),
  ('25', 'party', '8', 'Penerima', 22),
  ('25', 'header', 'currency_code', 'Valuta', 30),
  ('25', 'header', 'ndpbm', 'NDPBM', 31),
  ('25', 'header', 'cif_value', 'Nilai CIF', 32),
  ('25', 'header', 'delivery_price', 'Harga penyerahan', 33),
  ('25', 'details', 'deliveryReasonCode', 'Tujuan pengeluaran', 34),
  ('25', 'line', 'cif_value', 'Nilai CIF', 106),
  ('25', 'line', 'delivery_price', 'Harga penyerahan', 107),
  -- BC 3.0: ekspor.
  ('30', 'party', '2', 'Eksportir', 20),
  ('30', 'party', '6', 'Pembeli', 21),
  ('30', 'header', 'currency_code', 'Valuta', 30),
  ('30', 'header', 'ndpbm', 'NDPBM', 31),
  ('30', 'header', 'fob_value', 'Nilai FOB', 32),
  ('30', 'details', 'incotermCode', 'Incoterm', 33),
  ('30', 'details', 'loadingPortCode', 'Pelabuhan muat', 50),
  ('30', 'details', 'destinationPortCode', 'Pelabuhan tujuan', 51),
  ('30', 'details', 'destinationCountryCode', 'Negara tujuan', 52),
  ('30', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('30', 'transport', 'name', 'Nama sarana angkut', 61),
  ('30', 'line', 'fob_value', 'Nilai FOB', 106),
  -- BC 4.1: pengeluaran kembali barang asal TLDDP.
  ('41', 'party', '3', 'Pengusaha TPB', 20),
  ('41', 'party', '7', 'Pemilik barang', 21),
  ('41', 'party', '8', 'Penerima', 22),
  ('41', 'header', 'delivery_price', 'Harga penyerahan', 30),
  ('41', 'line', 'delivery_price', 'Harga penyerahan', 106)
) AS r(doc_code, target, field, label, position)
ON CONFLICT (doc_code, target, field) DO NOTHING;
