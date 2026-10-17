-- Custom SQL migration file, put your code below! --
-- Duplikat dokumen BC (backlog M3-13, PRD 7.6) untuk pengiriman berulang: Draft baru dengan nomor
-- aju baru, berisi salinan header, entitas, barang beserta pungutan, kemasan, peti kemas,
-- pengangkutan, dan baris lampiran tanpa file (file milik dokumen asal). Status, nomor daftar,
-- respon, dan riwayat revisi tidak ikut.
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
    document_id, entity_type_code, partner_id, name, address, country_code, identity_type_code,
    identity_number, nib, permit_number, permit_date, details)
  SELECT new_id, entity_type_code, partner_id, name, address, country_code, identity_type_code,
    identity_number, nib, permit_number, permit_date, details
  FROM customs_document_parties WHERE document_id = p_id;

  -- Produk yang sudah diarsipkan atau tidak punya kode HS lagi ditolak trigger baris barang.
  FOR line IN SELECT * FROM customs_document_lines WHERE document_id = p_id ORDER BY seq LOOP
    INSERT INTO customs_document_lines (
      document_id, seq, product_id, item_code, hs_code, description, brand, item_type, item_size,
      specification, qty, ceisa_unit_code, stock_qty, package_qty, package_type_code, net_weight,
      origin_country_code, unit_price, invoice_value, cif_value, fob_value, freight_value,
      insurance_value, delivery_price, customs_value, details)
    VALUES (
      new_id, line.seq, line.product_id, line.item_code, line.hs_code, line.description,
      line.brand, line.item_type, line.item_size, line.specification, line.qty,
      line.ceisa_unit_code, line.stock_qty, line.package_qty, line.package_type_code,
      line.net_weight, line.origin_country_code, line.unit_price, line.invoice_value,
      line.cif_value, line.fob_value, line.freight_value, line.insurance_value,
      line.delivery_price, line.customs_value, line.details)
    RETURNING id INTO new_line;
    INSERT INTO customs_line_taxes (line_id, levy_type_code, rate, facility_code, facility_rate, amount)
    SELECT new_line, levy_type_code, rate, facility_code, facility_rate, amount
    FROM customs_line_taxes WHERE line_id = line.id;
  END LOOP;

  INSERT INTO customs_attachments (document_id, seq, document_type_code, number, date)
  SELECT new_id, seq, document_type_code, number, date
  FROM customs_attachments WHERE document_id = p_id;
  INSERT INTO customs_packages (document_id, seq, qty, package_type_code, marks)
  SELECT new_id, seq, qty, package_type_code, marks FROM customs_packages WHERE document_id = p_id;
  INSERT INTO customs_containers (document_id, seq, number, size_code, type_code, load_type_code)
  SELECT new_id, seq, number, size_code, type_code, load_type_code
  FROM customs_containers WHERE document_id = p_id;
  INSERT INTO customs_transports (document_id, seq, transport_mode_code, name, voyage_number,
    flag_country_code)
  SELECT new_id, seq, transport_mode_code, name, voyage_number, flag_country_code
  FROM customs_transports WHERE document_id = p_id;

  PERFORM refresh_customs_document_status(new_id);
  RETURN new_id;
END;
$$;
