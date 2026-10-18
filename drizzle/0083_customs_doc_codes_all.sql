-- Semua jenis dokumen BC punya form (backlog D-01–D-08): BC 2.0, 2.6.1, 2.6.2, 2.7 (jadwal fase 2)
-- dan BC 1.6, 2.8, 3.3, P3BET (kode CEISA 331, jadwal fase 3) ditambahkan ke customs_doc_code.
-- Gerbang transfer (customs_movement_doc_codes) dan alokasi asal (customs_origin_doc_codes) belum
-- memakai jenis baru ini.
--
-- Catatan migrasi: drizzle menjalankan semua migrasi dalam satu transaksi, dan Postgres menolak
-- nilai enum dari ALTER TYPE ... ADD VALUE dipakai di transaksi yang sama. Aturan validasi jenis
-- baru harus di-seed di sini, jadi tipenya dibuat ulang (nilai dari CREATE TYPE langsung bisa
-- dipakai): kolom, fungsi, dan view yang memakai tipe lama dipindah ke tipe baru.
DROP VIEW customs_origin_balances;--> statement-breakpoint
ALTER TYPE "public"."customs_doc_code" RENAME TO "customs_doc_code_old";--> statement-breakpoint
CREATE TYPE "public"."customs_doc_code" AS ENUM('23', '40', '25', '30', '41', '20', '261', '262', '27', '16', '28', '33', '331');--> statement-breakpoint
ALTER TABLE "customs_documents" ALTER COLUMN "doc_code" SET DATA TYPE "public"."customs_doc_code" USING "doc_code"::text::"public"."customs_doc_code";--> statement-breakpoint
ALTER TABLE "doc_validation_rules" ALTER COLUMN "doc_code" SET DATA TYPE "public"."customs_doc_code" USING "doc_code"::text::"public"."customs_doc_code";--> statement-breakpoint
DROP FUNCTION customs_doc_direction(customs_doc_code_old);--> statement-breakpoint
DROP FUNCTION customs_doc_title(customs_doc_code_old);--> statement-breakpoint
DROP FUNCTION customs_origin_doc_codes(customs_doc_code_old);--> statement-breakpoint
DROP FUNCTION customs_movement_doc_codes(movement_code);--> statement-breakpoint
DROP FUNCTION next_aju_number(customs_doc_code_old, text, date);--> statement-breakpoint
DROP TYPE "public"."customs_doc_code_old";--> statement-breakpoint
-- Arah dokumen (PRD 7.1). Sama dengan CUSTOMS_DOC_DIRECTIONS di
-- src/modules/it-inventory/lib/customs.ts. BC 2.7 dan 3.3 dipakai dua arah di hmx; dicatat keluar
-- (dokumen pihak pengirim) sampai aturan gerbangnya diputuskan.
CREATE FUNCTION customs_doc_direction(p_doc_code customs_doc_code)
RETURNS movement_direction
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_doc_code IN ('23', '40', '20', '262', '16') THEN 'in'
    ELSE 'out'
  END::movement_direction;
$$;
--> statement-breakpoint
-- Nama jenis untuk pesan: BC 2.6.1, P3BET, dst. Sama dengan CUSTOMS_DOC_CODE_LABELS.
CREATE FUNCTION customs_doc_title(p_doc_code customs_doc_code) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_doc_code
    WHEN '261' THEN 'BC 2.6.1'
    WHEN '262' THEN 'BC 2.6.2'
    WHEN '331' THEN 'P3BET'
    ELSE 'BC ' || left(p_doc_code::text, 1) || '.' || substr(p_doc_code::text, 2)
  END;
$$;
--> statement-breakpoint
-- Tidak berubah dari 0081: hanya jenis MVP yang punya dokumen asal.
CREATE FUNCTION customs_origin_doc_codes(p_doc_code customs_doc_code)
RETURNS customs_doc_code[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_doc_code
    WHEN '25' THEN ARRAY['23', '40']
    WHEN '30' THEN ARRAY['23', '40']
    WHEN '41' THEN ARRAY['40']
    ELSE ARRAY[]::text[]
  END::customs_doc_code[];
$$;
--> statement-breakpoint
-- Tidak berubah dari 0078: gerbang hanya untuk jenis MVP.
CREATE FUNCTION customs_movement_doc_codes(p_code movement_code)
RETURNS customs_doc_code[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_code
    WHEN 'gr' THEN ARRAY['23', '40']
    WHEN 'gi' THEN ARRAY['25', '30', '41']
    ELSE ARRAY[]::text[]
  END::customs_doc_code[];
$$;
--> statement-breakpoint
-- Tidak berubah dari 0068. Kode dokumen 3 digit (331 untuk P3BET) tetap muat di format aju.
CREATE FUNCTION next_aju_number(
  p_doc_code customs_doc_code,
  p_office_code text DEFAULT NULL,
  p_date date DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  company_code text := (SELECT value #>> '{}' FROM system_settings WHERE key = 'customs.aju_company_code');
  office_code text := coalesce(p_office_code, (SELECT supervising_office_code FROM company));
  aju_date date := coalesce(p_date, (now() AT TIME ZONE 'Asia/Jakarta')::date);
  running integer;
BEGIN
  IF company_code IS NULL OR company_code !~ '^[0-9A-Z]{3}$' THEN
    RAISE EXCEPTION 'Kode perusahaan untuk nomor aju harus 3 huruf besar atau angka (Pengaturan customs.aju_company_code).';
  END IF;
  IF office_code IS NULL THEN
    RAISE EXCEPTION 'Kantor pabean dokumen belum dipilih dan profil perusahaan belum diisi.';
  END IF;
  IF office_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Kode kantor pabean % harus 6 digit untuk nomor aju.', office_code;
  END IF;
  running := next_number('aju:' || p_doc_code::text, '');
  IF running > 999999 THEN
    RAISE EXCEPTION 'Nomor urut aju BC % sudah melewati 999999.', p_doc_code;
  END IF;
  RETURN company_code || lpad(p_doc_code::text, 3, '0') || office_code
    || to_char(aju_date, 'YYYYMMDD') || lpad(running::text, 6, '0');
END;
$$;
--> statement-breakpoint
-- Sama dengan 0081.
CREATE VIEW customs_origin_balances AS
SELECT l.id AS line_id, l.document_id, d.doc_code, d.aju_number, d.registration_number,
  d.registration_date, l.seq, l.product_id, coalesce(l.stock_qty, 0) AS qty_in,
  coalesce(a.allocated, 0) AS allocated,
  coalesce(l.stock_qty, 0) - coalesce(a.allocated, 0) AS remaining
FROM customs_document_lines l
JOIN customs_documents d ON d.id = l.document_id
LEFT JOIN LATERAL (
  SELECT sum(oa.qty) AS allocated
  FROM origin_allocations oa
  JOIN customs_document_lines ol ON ol.id = oa.out_line_id
  JOIN customs_documents od ON od.id = ol.document_id
  WHERE oa.origin_line_id = l.id AND od.status <> 'cancelled'
) a ON true
WHERE d.status = 'registered' AND customs_doc_direction(d.doc_code) = 'in';
--> statement-breakpoint
-- Aturan validasi jenis baru, dengan pola yang sama dengan 0070: aturan umum semua jenis, lalu
-- entitas dan field kunci per jenis dari form hmx (document_XX.py).
INSERT INTO doc_validation_rules (doc_code, target, field, label, position)
SELECT d.doc_code::customs_doc_code, r.target::customs_rule_target, r.field, r.label, r.position
FROM (VALUES ('20'), ('261'), ('262'), ('27'), ('16'), ('28'), ('33'), ('331')) AS d(doc_code)
CROSS JOIN (VALUES
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
  -- BC 2.0: impor untuk dipakai.
  ('20', 'party', '1', 'Importir', 20),
  ('20', 'party', '7', 'Pemilik barang', 21),
  ('20', 'party', '9', 'Pengirim', 22),
  ('20', 'header', 'currency_code', 'Valuta', 30),
  ('20', 'header', 'ndpbm', 'NDPBM', 31),
  ('20', 'header', 'cif_value', 'Nilai CIF', 32),
  ('20', 'details', 'importTypeCode', 'Jenis impor', 33),
  ('20', 'details', 'loadingPortCode', 'Pelabuhan muat', 50),
  ('20', 'details', 'unloadingPortCode', 'Pelabuhan bongkar', 51),
  ('20', 'details', 'tpsCode', 'Tempat penimbunan sementara', 52),
  ('20', 'details', 'bc11Number', 'Nomor BC 1.1', 53),
  ('20', 'details', 'bc11Date', 'Tanggal BC 1.1', 54),
  ('20', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('20', 'transport', 'name', 'Nama sarana angkut', 61),
  ('20', 'line', 'origin_country_code', 'Negara asal', 106),
  ('20', 'line', 'cif_value', 'Nilai CIF', 107),
  -- BC 2.6.1: pengeluaran sementara dengan jaminan.
  ('261', 'party', '3', 'Pengusaha TPB', 20),
  ('261', 'party', '8', 'Penerima', 21),
  ('261', 'party', '7', 'Pemilik barang', 22),
  ('261', 'header', 'currency_code', 'Valuta', 30),
  ('261', 'header', 'ndpbm', 'NDPBM', 31),
  ('261', 'header', 'cif_value', 'Nilai CIF', 32),
  ('261', 'details', 'temporaryReasonCode', 'Tujuan pengiriman', 33),
  ('261', 'line', 'cif_value', 'Nilai CIF', 106),
  -- BC 2.6.2: pemasukan kembali.
  ('262', 'party', '3', 'Pengusaha TPB', 20),
  ('262', 'party', '9', 'Pengirim', 21),
  ('262', 'party', '7', 'Pemilik barang', 22),
  ('262', 'header', 'currency_code', 'Valuta', 30),
  ('262', 'header', 'ndpbm', 'NDPBM', 31),
  ('262', 'header', 'cif_value', 'Nilai CIF', 32),
  ('262', 'details', 'temporaryReasonCode', 'Tujuan pemasukan', 33),
  ('262', 'line', 'cif_value', 'Nilai CIF', 106),
  -- BC 2.7: antar TPB.
  ('27', 'party', '3', 'Pengusaha TPB', 20),
  ('27', 'party', '7', 'Pemilik barang', 21),
  ('27', 'party', '8', 'Penerima', 22),
  ('27', 'header', 'currency_code', 'Valuta', 30),
  ('27', 'header', 'ndpbm', 'NDPBM', 31),
  ('27', 'header', 'cif_value', 'Nilai CIF', 32),
  ('27', 'details', 'destinationOfficeCode', 'Kantor pabean tujuan', 33),
  ('27', 'details', 'deliveryReasonCode', 'Alasan pengiriman', 34),
  ('27', 'line', 'cif_value', 'Nilai CIF', 106),
  -- BC 1.6: pemasukan ke PLB.
  ('16', 'party', '3', 'Pengusaha PLB', 20),
  ('16', 'party', '7', 'Pemilik barang', 21),
  ('16', 'party', '9', 'Pengirim', 22),
  ('16', 'header', 'currency_code', 'Valuta', 30),
  ('16', 'header', 'ndpbm', 'NDPBM', 31),
  ('16', 'header', 'cif_value', 'Nilai CIF', 32),
  ('16', 'details', 'plbWarehouseCode', 'Kode gudang PLB', 33),
  ('16', 'details', 'loadingPortCode', 'Pelabuhan muat', 50),
  ('16', 'details', 'unloadingPortCode', 'Pelabuhan bongkar', 51),
  ('16', 'details', 'bc11Number', 'Nomor BC 1.1', 53),
  ('16', 'details', 'bc11Date', 'Tanggal BC 1.1', 54),
  ('16', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('16', 'transport', 'name', 'Nama sarana angkut', 61),
  ('16', 'line', 'origin_country_code', 'Negara asal', 106),
  ('16', 'line', 'cif_value', 'Nilai CIF', 107),
  -- BC 2.8: impor dari PLB.
  ('28', 'party', '3', 'Pengusaha PLB', 20),
  ('28', 'party', '1', 'Importir', 21),
  ('28', 'party', '7', 'Pemilik barang', 22),
  ('28', 'header', 'currency_code', 'Valuta', 30),
  ('28', 'header', 'ndpbm', 'NDPBM', 31),
  ('28', 'header', 'cif_value', 'Nilai CIF', 32),
  ('28', 'details', 'importTypeCode', 'Jenis impor', 33),
  ('28', 'details', 'plbWarehouseCode', 'Kode gudang PLB', 50),
  ('28', 'line', 'origin_country_code', 'Negara asal', 106),
  ('28', 'line', 'cif_value', 'Nilai CIF', 107),
  -- BC 3.3: ekspor melalui PLB.
  ('33', 'party', '2', 'Eksportir', 20),
  ('33', 'party', '3', 'Pengusaha PLB', 21),
  ('33', 'party', '6', 'Pembeli', 22),
  ('33', 'header', 'currency_code', 'Valuta', 30),
  ('33', 'header', 'ndpbm', 'NDPBM', 31),
  ('33', 'header', 'fob_value', 'Nilai ekspor FOB', 32),
  ('33', 'details', 'exportTypeCode', 'Jenis ekspor', 33),
  ('33', 'details', 'incotermCode', 'Incoterm', 34),
  ('33', 'details', 'loadingPortCode', 'Pelabuhan muat asal', 50),
  ('33', 'details', 'destinationPortCode', 'Pelabuhan tujuan', 51),
  ('33', 'details', 'destinationCountryCode', 'Negara tujuan', 52),
  ('33', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('33', 'transport', 'name', 'Nama sarana angkut', 61),
  ('33', 'line', 'fob_value', 'Nilai FOB', 106),
  -- P3BET.
  ('331', 'party', '3', 'Pengusaha PLB', 20),
  ('331', 'party', '8', 'Penerima', 21),
  ('331', 'details', 'plbWarehouseCode', 'Kode gudang PLB', 50),
  ('331', 'details', 'loadingPortCode', 'Pelabuhan muat', 51),
  ('331', 'details', 'destinationPortCode', 'Pelabuhan tujuan', 52),
  ('331', 'details', 'destinationCountryCode', 'Negara tujuan', 53),
  ('331', 'transport', 'transport_mode_code', 'Cara angkut', 60),
  ('331', 'transport', 'name', 'Nama sarana angkut', 61)
) AS r(doc_code, target, field, label, position)
ON CONFLICT (doc_code, target, field) DO NOTHING;
