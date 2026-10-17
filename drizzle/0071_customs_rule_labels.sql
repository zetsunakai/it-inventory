-- Custom SQL migration file, put your code below! --
-- Label aturan validasi barang disamakan dengan label form BC (backlog M3-05).
UPDATE doc_validation_rules SET label = 'Jumlah'
WHERE target = 'line' AND field = 'qty' AND label = 'Jumlah satuan';
--> statement-breakpoint
UPDATE doc_validation_rules SET label = 'Qty satuan stok'
WHERE target = 'line' AND field = 'stock_qty' AND label = 'Jumlah dalam satuan stok';
