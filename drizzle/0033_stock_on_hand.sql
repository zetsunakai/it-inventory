-- Custom SQL migration file, put your code below! --
-- Fungsi saldo (backlog M2-11, PRD bagian 6.1): saldo per produk × lokasi × lot pada waktu
-- tertentu, dihitung langsung dari ledger. Untuk "sekarang" hasilnya sama dengan stock_balances;
-- halaman Stok memakainya untuk melihat saldo per akhir tanggal tertentu.
CREATE OR REPLACE FUNCTION stock_on_hand(p_at timestamptz)
RETURNS TABLE (product_id uuid, location_id uuid, lot_id uuid, qty numeric)
LANGUAGE sql STABLE AS $$
  SELECT product_id, location_id, lot_id, sum(delta)
  FROM (
    SELECT product_id, destination_location_id AS location_id, lot_id, qty AS delta
    FROM stock_moves WHERE status = 'done' AND done_at <= p_at
    UNION ALL
    SELECT product_id, source_location_id, lot_id, -qty
    FROM stock_moves WHERE status = 'done' AND done_at <= p_at
  ) ledger
  GROUP BY product_id, location_id, lot_id
  HAVING sum(delta) <> 0;
$$;
--> statement-breakpoint
-- Akhir hari (WIB) untuk tanggal kalender, mis. filter "per tanggal" dan kartu stok.
CREATE OR REPLACE FUNCTION end_of_day(p_date date) RETURNS timestamptz
LANGUAGE sql IMMUTABLE AS $$
  SELECT make_timestamptz(
    extract(year FROM p_date + 1)::int, extract(month FROM p_date + 1)::int,
    extract(day FROM p_date + 1)::int, 0, 0, 0, 'Asia/Jakarta'
  ) - interval '1 microsecond';
$$;
