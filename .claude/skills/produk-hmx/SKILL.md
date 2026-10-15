---
name: produk-hmx
description: Panduan revisi master produk, kategori, satuan (UoM), lot/serial, dan arsip produk di repo ini supaya mengikuti modul core_product dan ekstensi produk core_inventory/core_it_inventory hmx-002. Pakai setiap kali merencanakan, mengimplementasi, atau me-review perubahan master produk, satuan, kategori, tracking lot/serial, atau import produk.
---

# Revisi master produk mengikuti hmx-002

Keputusan user (14/10/2026): master produk dan alur inventory diambil dari hmx-002. Skill ini untuk
produk, kategori, satuan, dan lot/serial (M1-04, M1-05). Alur transfer/stok ada di skill
`inventory-alur-hmx`, sedangkan data kepabeanan produk (HS, satuan CEISA, siap BC) tetap mengikuti PRD dan
skill `it-inventory-domain`.

## File rujukan

| Topik                                                                         | File (`~/hmx/hmx-002/hmx/module/basic/…`)                                                                                                                              |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template produk                                                               | `core_product/models/product.py`                                                                                                                                       |
| Varian                                                                        | `core_product/models/product_variant.py`, `product_attribute.py`                                                                                                       |
| Kategori + nomor otomatis                                                     | `core_product/models/product_category.py`, `base_seqeuence.py`                                                                                                         |
| Satuan                                                                        | `core_product/models/uom_uom.py` (`uomuom`, `uomuomline`, `_compute_quantity`)                                                                                         |
| Barcode                                                                       | `core_product/models/multi_barcode.py`, `product_barcode.py`                                                                                                           |
| Merek                                                                         | `core_product/models/product_brand.py`                                                                                                                                 |
| Ekstensi inventory (stok, dimensi, tracking, batas terima/kirim, discontinue) | `core_inventory/models/product.py`, `core_inventory/models/product_category.py`                                                                                        |
| Arsip otomatis stok nol                                                       | `core_inventory/models/product_auto_archive.py`                                                                                                                        |
| Lot/serial                                                                    | `core_inventory/models/stock_lot.py`                                                                                                                                   |
| Jenis produk IT Inventory                                                     | `core_it_inventory/models/product.py` (`it_inventory_product_type`)                                                                                                    |
| Tes                                                                           | `core_product/tests/`, `core_inventory/tests/test_product_tracking.py`, `test_product_discontinuation.py`, `test_product_auto_archive.py`, `test_product_inventory.py` |

## Model hmx

**Template dan varian.** `product` (template) punya `name`, `type` (Stock/Non-stock/Service),
`categ`, `uom`, `uom_po`, `secondary_uom`, `default_code` (kode), `barcode` + `barcode_type`,
`brand_id`, `weight`, `volume`, `tracking`, pengaturan nomor lot/serial otomatis, kedaluwarsa,
`is_active` + `archived_by`/`archived_at`. `productvariant` mewarisi template (satu varian bila
tanpa atribut) dan semua transaksi stok merujuk **varian**.

**Kategori.** `productcategory` bertingkat (`parent`, `complete_name`), `code_prefix` +
`code_digits` + `code_generation_method` (manual/otomatis): kode produk dibuat dari urutan
kategori (mis. `RM000001`). Ekstensi inventory: batas terima/kirim, metode biaya.

**Satuan.** `uomuom` = satuan acuan (rasio 1, presisi), `uomuomline` = satuan turunan dengan
`ratio` terhadap acuan ("1 satuan = ratio × acuan") dan `rounding`. Baris tanpa `product` berlaku
global, baris dengan `product` khusus produk itu (mis. 1 BOX = 24 PCS hanya untuk produk X).
Konversi: `qty_tujuan = qty × ratio_asal / ratio_tujuan`, hanya dalam satu acuan, dibulatkan
sesuai `rounding` satuan tujuan.

**Tracking.** `tracking` none/lot/serial. Tidak bisa diubah bila produk sudah punya stok atau
transaksi berjalan (`_validate_tracking_change`). Nomor lot/serial bisa dibuat otomatis
(prefix, suffix, digit, boleh memakai kode produk); nomor yang diprediksi baru dipakai saat
transfer divalidasi. Lot punya kedaluwarsa (`expiration_time`, `alert_time` ≤ kedaluwarsa) dan
status active/out.

**Arsip dan discontinue.** Arsip manual atau otomatis (`archived_by`: manual, cascade template,
regenerasi varian, auto stock zero). `is_discontinued`: produk tidak boleh dipakai untuk
permintaan masuk baru, tapi sisa stok tetap bisa dikeluarkan.

**IT Inventory.** `it_inventory_product_type` material/wip/finished (kosong boleh), dibaca saat
laporan dibuat.

## Pemetaan ke repo ini

Status 15/10/2026: R-01 (kategori bertingkat + SKU otomatis), R-02 (`products.tracking`, nomor lot
otomatis, nomor seri per unit), dan R-03 (`uoms.product_id`, `rounding`) sudah dikerjakan; kolom
"Repo ini sekarang" di bawah adalah keadaan sebelum revisi. Kedaluwarsa, barcode terpisah, dan
discontinue belum diputuskan.

| hmx                                          | Repo ini sekarang                                                  | Arah revisi                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default_code`                               | `sku` (unik, tidak bisa diubah setelah ada transaksi)              | Tetap `sku`. Tambah nomor otomatis per kategori bila user mau.                                                                                                                                                       |
| `type` Stock/Non-stock/Service               | Semua produk adalah produk stok                                    | Hanya produk stok yang masuk IT Inventory. Tambah `type` hanya bila ada kebutuhan non-stok.                                                                                                                          |
| `categ` bertingkat + prefix kode             | `category` enum 5 jenis laporan (PRD 9.2)                          | Pisahkan dua hal: **kategori produk** (bertingkat, seperti hmx) dan **kategori laporan IT Inventory** (enum PRD, padanan `it_inventory_product_type`). Kategori laporan tetap wajib dan tetap disalin ke pergerakan. |
| `it_inventory_product_type` 3 jenis          | `category` 5 jenis (termasuk mesin dan scrap)                      | Pertahankan 5 jenis PRD; laporan BC memang meminta mesin dan scrap.                                                                                                                                                  |
| `uomuom` + `uomuomline` global/khusus produk | `uom_categories` + `uoms` (`factor`, `is_reference`), semua global | Model sama (acuan + rasio). Tambah satuan khusus produk (`uoms.product_id`) dan `rounding`. Konversi tetap di database (`convert_qty`, numeric).                                                                     |
| `uom_po`, `secondary_uom`                    | Tidak ada                                                          | Tidak diambil (tanpa modul pembelian).                                                                                                                                                                               |
| `tracking` none/lot/serial                   | `lot_required` boolean                                             | Ganti dengan `tracking`. Serial: qty 1 per nomor, unik per produk. Kunci perubahan bila sudah ada stok atau transaksi belum selesai (aturan DB).                                                                     |
| Nomor lot/serial otomatis, kedaluwarsa       | Lot diketik manual, tanpa kedaluwarsa                              | Opsional. Kedaluwarsa berguna untuk FEFO bila reservasi dibuat.                                                                                                                                                      |
| `barcode`, `multi_barcode`                   | Scan memakai SKU                                                   | Opsional: barcode terpisah dari SKU bila label vendor berbeda.                                                                                                                                                       |
| `brand_id` (master merek)                    | `brand`, `model`, `size` berupa teks                               | Teks cukup; data BC hanya butuh uraian.                                                                                                                                                                              |
| `weight`, `volume`, dimensi                  | `net_weight` (kg per satuan stok)                                  | Pertahankan (dibutuhkan netto BC). Dimensi tidak diambil.                                                                                                                                                            |
| Varian + atribut                             | Tidak ada; satu produk = satu SKU                                  | **Tidak diambil.** Setiap SKU adalah satu produk; dokumen BC dan HS per barang, bukan per template.                                                                                                                  |
| Arsip + `archived_by`, auto archive stok nol | `active` + `deleteUnlessUsed` (M1-08)                              | Pertahankan aturan arsip/hapus. Tambah `archived_at`/oleh bila diperlukan audit. Arsip otomatis tidak diambil.                                                                                                       |
| `is_discontinued`                            | Tidak ada                                                          | Opsional: blok penerimaan baru, pengiriman tetap boleh.                                                                                                                                                              |
| Batas terima/kirim per kategori/produk       | Tidak ada                                                          | Tidak diambil (tidak ada PO/SO).                                                                                                                                                                                     |
| Harga, metode biaya                          | Tidak ada                                                          | Tidak diambil (tanpa valuasi). Nilai barang ada di dokumen BC.                                                                                                                                                       |

## Yang tetap dari repo ini

- Data kepabeanan produk: `hs_code`, `ceisa_unit_code`, faktor CEISA, `customs_ready` yang dihitung
  database (PRD 5.3). hmx tidak punya data ini di produk (data ini diisi di baris dokumen BC).
  Pertahankan di produk supaya dokumen BC terisi otomatis.
- Satuan stok, SKU, dan kategori laporan tidak bisa diubah setelah produk punya transaksi (aturan
  database). Ini sama semangatnya dengan kunci `tracking` hmx; perluas ke `tracking`.
- Qty dan rasio `numeric`, bukan float. Konversi dan pembulatan dilakukan database.
- Import/export Excel M1-07 ikut diperbarui setiap kali ada kolom baru (`src/server/master-io`).

## Cara mengerjakan

1. Catat keputusan di PRD 5.1/5.3 dan 15.4, lalu buat tiket revisi di Backlog (mis. `R1-xx`).
2. Migrasi baru plus migrasi data: `lot_required = true` → `tracking = 'lot'`, selain itu
   `'none'`; kategori produk bertingkat diisi awal dari kategori laporan bila belum ada data lain.
3. Perbarui fungsi DB yang membaca `lot_required` (`validate_transfer`, opname), form produk,
   import/export, seed, dan tes (`tests/db`, `tests/e2e`).
4. UI mengikuti skill `ui-it-inventory`. Label: "Pelacakan: Tanpa / Per lot / Per nomor seri",
   "Satuan khusus produk", "Kategori produk" vs "Kategori laporan IT Inventory".

## Keputusan user (14/10/2026)

- Kategori produk bertingkat dengan SKU otomatis, pelacakan per nomor seri, dan satuan khusus
  produk: **masuk lingkup** (Backlog R-01, R-02, R-03, RU-13, RU-14, RU-15).
- Barcode terpisah dari SKU, kedaluwarsa lot, dan discontinue: belum diputuskan, jadi jangan dikerjakan
  dulu.
