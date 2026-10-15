-- Revisi master produk (backlog RM-01): satuan CEISA beserta faktornya pindah ke baris dokumen BC
-- (M3), berat netto dihapus, dan prefix nomor lot/seri otomatis disamakan dengan product code.
-- Siap dokumen BC cukup kode HS.
ALTER TABLE "products" ADD COLUMN "lot_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products" SET "lot_auto" = true WHERE "lot_prefix" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "products" drop column "customs_ready";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "customs_ready" boolean GENERATED ALWAYS AS (hs_code is not null) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "ceisa_unit_code";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "ceisa_factor";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "net_weight";--> statement-breakpoint
-- Fungsi lama memakai lot_prefix; ganti dulu sebelum kolomnya dihapus.
-- Nomor lot/seri berikutnya: product code + "-" + nomor urut produk, diisi nol sampai lot_digits
-- (nomor yang lebih panjang tidak dipotong). Nomor yang sudah dipakai lot lain dilewati.
CREATE OR REPLACE FUNCTION next_lot_name(p_product_id uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  product products%ROWTYPE;
  n integer;
  candidate text;
BEGIN
  SELECT * INTO product FROM products WHERE id = p_product_id;
  IF NOT product.lot_auto THEN
    RAISE EXCEPTION 'Produk % tidak memakai nomor lot/seri otomatis.', product.sku;
  END IF;
  LOOP
    n := next_number('lot:' || p_product_id, '');
    candidate := product.sku || '-' ||
      CASE WHEN length(n::text) >= product.lot_digits THEN n::text
        ELSE lpad(n::text, product.lot_digits, '0') END;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM lots WHERE product_id = p_product_id AND name = candidate
    );
  END LOOP;
  RETURN candidate;
END;
$$;
--> statement-breakpoint
-- Baris yang lot/serinya diisi otomatis saat validasi: barang masuk dari luar gudang (penerimaan
-- dari vendor, penyesuaian tambah) untuk produk berpelacakan bernomor otomatis, dengan lot kosong.
CREATE OR REPLACE FUNCTION move_gets_auto_lot(p_move_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT m.lot_id IS NULL AND p.tracking <> 'none' AND p.lot_auto
    AND t.type IN ('receipt', 'adjustment') AND m.source_warehouse_id IS NULL
    AND m.destination_warehouse_id IS NOT NULL
  FROM stock_moves m
  JOIN products p ON p.id = m.product_id
  JOIN transfers t ON t.id = m.transfer_id
  WHERE m.id = p_move_id;
$$;
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "lot_prefix";--> statement-breakpoint
ALTER TABLE "products"
  ADD CONSTRAINT products_lot_auto_needs_tracking CHECK (NOT lot_auto OR tracking <> 'none');
