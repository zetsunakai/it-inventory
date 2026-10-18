-- Custom SQL migration file, put your code below! --
-- Gerbang dokumen BC (backlog M4-02, PRD bagian 8.4): penerimaan (gr) dan pengiriman (gi) hanya bisa
-- Selesai bila ditautkan ke dokumen BC yang Terdaftar, dan qty per produk (satuan stok) tidak
-- melebihi sisa dokumen: qty dokumen dikurangi transfer lain yang sudah Selesai dengan dokumen yang
-- sama (parsial boleh, kelebihan toleransi 0). Dokumen yang sedang direvisi kembali ke Draft, jadi
-- otomatis menahan transfer yang belum Selesai. Dipanggil transfer_validation_errors() di dalam
-- validate_transfer(), sehingga tidak bisa dilewati lewat aplikasi atau API, tanpa override.
--
-- app.customs_gate = 'off' hanya untuk tes inventory lama yang memvalidasi penerimaan/pengiriman
-- tanpa dokumen (koneksi tes dibuka dengan options -c app.customs_gate=off). Sama seperti
-- app.ledger_write, ini bukan batas keamanan: aplikasi tidak pernah menyetelnya.

CREATE OR REPLACE FUNCTION customs_gate_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.customs_gate', true), '') <> 'off';
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION customs_gate_errors(p_transfer_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE AS $$
DECLARE
  transfer transfers%ROWTYPE;
  doc customs_documents%ROWTYPE;
  allowed customs_doc_code[];
  item record;
  errors text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id;
  allowed := customs_movement_doc_codes(transfer.movement_code);
  IF cardinality(allowed) = 0 OR NOT customs_gate_enabled() THEN
    RETURN errors;
  END IF;

  IF transfer.customs_document_id IS NULL THEN
    RETURN ARRAY[format(
      'Transfer %s belum ditautkan ke dokumen BC (%s).',
      transfer.number,
      (SELECT string_agg(customs_doc_title(code), ' atau ') FROM unnest(allowed) code)
    )];
  END IF;

  SELECT * INTO doc FROM customs_documents WHERE id = transfer.customs_document_id;
  IF doc.status <> 'registered' THEN
    errors := errors || format(
      'Dokumen %s %s masih %s; transfer baru bisa Selesai setelah dokumen Terdaftar.',
      customs_doc_title(doc.doc_code), doc.aju_number, customs_status_label(doc.status)
    );
  END IF;

  -- Qty per produk: transfer ini + transfer lain Selesai dengan dokumen sama ≤ qty dokumen.
  FOR item IN
    WITH current_moves AS (
      SELECT product_id, sum(qty) AS qty FROM stock_moves
      WHERE transfer_id = transfer.id AND status <> 'cancelled'
      GROUP BY product_id
    ),
    document_qty AS (
      SELECT product_id, sum(coalesce(stock_qty, 0)) AS qty FROM customs_document_lines
      WHERE document_id = doc.id GROUP BY product_id
    ),
    done_qty AS (
      SELECT m.product_id, sum(m.qty) AS qty
      FROM stock_moves m JOIN transfers t ON t.id = m.transfer_id
      WHERE t.customs_document_id = doc.id AND t.id <> transfer.id AND m.status = 'done'
      GROUP BY m.product_id
    )
    SELECT p.sku, c.qty AS transfer_qty, d.qty AS document_qty, coalesce(o.qty, 0) AS done_qty
    FROM current_moves c
    JOIN products p ON p.id = c.product_id
    LEFT JOIN document_qty d ON d.product_id = c.product_id
    LEFT JOIN done_qty o ON o.product_id = c.product_id
    ORDER BY p.sku
  LOOP
    IF item.document_qty IS NULL THEN
      errors := errors || format('Produk %s tidak ada di dokumen %s %s.',
        item.sku, customs_doc_title(doc.doc_code), doc.aju_number);
    ELSIF item.transfer_qty + item.done_qty > item.document_qty THEN
      errors := errors || format(
        'Produk %s: qty transfer %s melebihi sisa dokumen %s (qty dokumen %s, sudah Selesai %s).',
        item.sku, trim_scale(item.transfer_qty),
        trim_scale(greatest(item.document_qty - item.done_qty, 0)),
        trim_scale(item.document_qty), trim_scale(item.done_qty));
    END IF;
  END LOOP;
  RETURN errors;
END;
$$;
