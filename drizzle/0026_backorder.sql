-- Custom SQL migration file, put your code below! --
-- Penerimaan dan pengiriman parsial (backlog M2-05, PRD bagian 6.4): sebelum validasi, qty yang
-- benar-benar diterima/dikirim per baris dipisah dari sisanya. Sisa dipindah ke transfer lanjutan
-- (backorder, Draft) yang menunjuk transfer asal lewat backorder_of_id. Dipanggil di transaksi
-- yang sama dengan validate_transfer(), jadi bila validasi gagal pemisahan ikut batal.
--
-- p_done: {"<id baris>": "<qty selesai dalam satuan input>"}. Baris yang tidak disebut dianggap
-- selesai penuh. Mengembalikan id transfer lanjutan, atau NULL bila semua baris selesai penuh.
CREATE OR REPLACE FUNCTION split_backorder(p_transfer_id uuid, p_done jsonb) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  transfer transfers%ROWTYPE;
  move record;
  done numeric;
  backorder_id uuid;
  errors text[] := ARRAY[]::text[];
  any_done boolean := false;
  any_rest boolean := false;
BEGIN
  SELECT * INTO transfer FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;
  IF transfer.status NOT IN ('draft', 'ready') THEN
    RAISE EXCEPTION 'Transfer % sudah %.', transfer.number,
      CASE transfer.status WHEN 'done' THEN 'Selesai' ELSE 'Batal' END;
  END IF;

  FOR move IN
    SELECT m.id, m.input_qty, p.sku FROM stock_moves m JOIN products p ON p.id = m.product_id
    WHERE m.transfer_id = p_transfer_id ORDER BY m.position
  LOOP
    BEGIN
      done := coalesce((p_done ->> move.id::text)::numeric, move.input_qty);
    EXCEPTION WHEN invalid_text_representation THEN
      errors := errors || format('Qty %s bukan angka.', move.sku);
      CONTINUE;
    END;
    IF done < 0 OR done > move.input_qty OR scale(done) > 4 THEN
      errors := errors || format(
        'Qty %s harus antara 0 dan %s.', move.sku, replace(trim_scale(move.input_qty)::text, '.', ',')
      );
    END IF;
    any_done := any_done OR done > 0;
    any_rest := any_rest OR done < move.input_qty;
  END LOOP;
  IF cardinality(errors) > 0 THEN
    RAISE EXCEPTION USING MESSAGE = array_to_string(errors, E'\n');
  END IF;
  IF NOT any_done THEN
    RAISE EXCEPTION 'Isi qty minimal satu baris. Untuk membatalkan semuanya, batalkan transfer.';
  END IF;
  IF NOT any_rest THEN
    RETURN NULL;
  END IF;

  INSERT INTO transfers (
    type, source_location_id, destination_location_id, partner_id, scheduled_date, reference,
    notes, reason, return_of_id, backorder_of_id
  )
  VALUES (
    transfer.type, transfer.source_location_id, transfer.destination_location_id,
    transfer.partner_id, transfer.scheduled_date, transfer.reference, transfer.notes,
    transfer.reason, transfer.return_of_id, transfer.id
  )
  RETURNING id INTO backorder_id;

  FOR move IN SELECT * FROM stock_moves WHERE transfer_id = p_transfer_id ORDER BY position LOOP
    done := coalesce((p_done ->> move.id::text)::numeric, move.input_qty);
    IF done = move.input_qty THEN
      CONTINUE;
    END IF;
    INSERT INTO stock_moves (
      transfer_id, product_id, lot_id, position, input_qty, input_uom_id,
      source_location_id, destination_location_id
    )
    VALUES (
      backorder_id, move.product_id, move.lot_id, move.position, move.input_qty - done,
      move.input_uom_id, move.source_location_id, move.destination_location_id
    );
    IF done = 0 THEN
      DELETE FROM stock_moves WHERE id = move.id;
    ELSE
      UPDATE stock_moves SET input_qty = done WHERE id = move.id;
    END IF;
  END LOOP;
  RETURN backorder_id;
END;
$$;
