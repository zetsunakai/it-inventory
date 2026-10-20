---
name: it-inventory-domain
description: Aturan domain IT Inventory Kawasan Berikat dan rujukan ke dua sistem lama (Odoo Equip3-moduleboard dan hmx-002). Pakai setiap kali merancang, mengimplementasi, atau me-review dokumen BC (M3), relasi dokumen ↔ transfer dan gerbang validasi (M4), laporan IT Inventory (M5), integrasi CEISA (fase 2), atau aturan ledger/periode di repo ini, dan setiap kali perlu melihat cara sistem lama mengerjakan hal yang sama.
---

# Domain IT Inventory

Repo ini membangun ulang IT Inventory untuk Kawasan Berikat sesuai PRD (dokumen "PRD — ERP IT
Inventory Kepabeanan", tab PRD dan Backlog). Dua sistem lama dipakai sebagai rujukan, bukan
untuk disalin: ambil aturan bisnis, kode resmi, dan format CEISA-nya; tetap ikuti arsitektur dan
aturan repo ini (README, migrasi `drizzle/`, skill `ui-it-inventory` untuk UI).

Alur inventory (transfer, stok, retur, opname) dan master produk mengikuti hmx-002
`core_inventory`/`core_product`, bukan Equip3: lihat skill `inventory-alur-hmx` dan `produk-hmx`.
Skill ini untuk dokumen BC, gerbang dokumen, laporan, dan CEISA.

## Sistem lama sebagai rujukan

|                    | Equip3-moduleboard                                                                                                                                   | hmx-002                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lokasi             | `~/odoo14/Equip3-moduleboard/core/equip3_manuf_it_inventory` (dokumen, laporan) dan `core/equip3_manuf_ceisa` (API CEISA)                            | `~/hmx/hmx-002/hmx/module/basic/core_it_inventory`                                                                                                                                               |
| Platform           | Odoo 14                                                                                                                                              | Framework hmx (Django, API mirip Odoo)                                                                                                                                                           |
| Sumber PRD         | Ya: format nomor aju (PRD 7.4), endpoint CEISA (PRD 10.1), seed referensi kepabeanan (`scripts/import-ref-codes-from-odoo.ts`)                       | Tidak dirujuk PRD; berguna untuk pola dokumen ↔ transfer dan laporan mutasi                                                                                                                      |
| Jenis dokumen      | 1.6, 2.3, 2.5, 2.6.1, 2.6.2, 2.7, 2.8, 3.3, P3BET (331), 4.0, 4.1, ekspor (3.0, model `ceisa.export.documents`), PBB KB                              | 1.6, 2.0, 2.3, 2.5, 2.6.1, 2.6.2, 2.7, 2.8, 3.0, 3.3, P3BET (331), 4.0, 4.1                                                                                                                      |
| Model dokumen      | Satu model per jenis (`ceisa.documents.bc23`, …), baris di model `ceisa_*_line`                                                                      | Satu model header per jenis (`it_inventory_document_23`, …), tabel baris bersama (`document_product`, `document_attachment`, `document_tax`, …) dengan FK per jenis + `document_code`            |
| Status             | Hanya `sent_state` (boolean) + nomor/tanggal register + respon                                                                                       | Draft → Submitted; setelah Submitted dokumen dan barisnya terkunci (`document_state.py`)                                                                                                         |
| Nomor aju          | Dibuat sistem: `HHHDDDXXXXXXYYYYMMDDNNNNNN` dari `ir.sequence` per jenis (`models/ceisa_no_aju.py`)                                                  | Tidak dibuat sistem (diisi lalu dikirim ke middleware)                                                                                                                                           |
| Entitas            | Field datar per peran (`exim_*`, `owner_*`, `supplier_*`, `buyer_*`, …) + `ceisa.entitas.line`                                                       | `document_entitas_line` (kode, identitas, NITKU, alamat)                                                                                                                                         |
| Field wajib        | Hardcode per jenis di `check_required_fields()` (`equip3_manuf_ceisa/models/ceisa_documents_bcXX.py`), satu error per kali; banyak baris dikomentari | Validasi di level form/model                                                                                                                                                                     |
| Dokumen ↔ transfer | `picking_ids` many2many, isi otomatis dari picking (`_onchange_pickings`); tidak ada gerbang                                                         | `inventory_transfers` many2many; `DOCUMENT_SOURCE_MAP` membatasi jenis transfer per dokumen (`models/inventory_transfer.py`); tidak ada gerbang                                                  |
| Dokumen asal       | Laporan relasi masuk ↔ keluar lewat `no_aju` (`report/it_inventory_report_relation.py`)                                                              | `source_sequence` (seri barang asal) di `document_product`; `DOCUMENT_FLOW_MAP` (pasangan dokumen masuk → keluar)                                                                                |
| Laporan mutasi     | View SQL per kategori (`report/it_*_mutation.py`, `it_inventory_list_mutation_report.py`), dibandingkan dengan opname terakhir                       | `reports/mutation_report.py`: saldo awal, masuk, keluar, penyesuaian, saldo akhir per gudang; kode movement menentukan kolom; keterangan opname (selisih positif/negatif/tidak ada/belum opname) |
| Kategori laporan   | Tidak disalin ke pergerakan                                                                                                                          | `product.it_inventory_type` (material, wip, finished) dibaca saat laporan dibuat                                                                                                                 |
| CEISA              | Langsung ke API (`endpoints.py`, payload `_api_ceisa_document_bcXX`, cron `ceisa_status_service.py`); token dan password di pengaturan perusahaan    | Lewat middleware terpisah (`it_inventory_ceisa_middleware.py`, `POST /api/it-inventory/v1/documents`, header `x-api-key` dan `Idempotency-Key`); username/password CEISA di tabel                |

## Keputusan untuk repo ini

Gabungan PRD dan pelajaran dari kedua sistem. Jangan mengubahnya tanpa mencatat keputusan baru di
PRD bagian 15.4.

1. **Satu set tabel dokumen generik** (`customs_documents`, `customs_document_lines`, …) dibedakan
   `doc_code`. Field khusus jenis di kolom jsonb. Bukan satu tabel per jenis seperti kedua sistem
   lama: menambah BC 2.7 atau 3.3 tidak butuh tabel baru. **Tampilan terpisah per jenis**
   (keputusan user 17/10/2026, PRD 15.4): setiap jenis punya menu, daftar, dan form sendiri seperti
   hmx (`views/document_XX_views.xml`), dirakit dari komponen form bersama (tab Header, Entitas,
   Dokumen, Pengangkut, Kemasan dan Peti Kemas, Transaksi, Barang, Pungutan, Pernyataan; backlog
   M3-04). Field tiap form mengikuti `models/document_XX.py` hmx; jangan membuat satu form generik
   yang menyembunyikan field per jenis. Sejak D-09 (keputusan user 18/10/2026) tab, grup, field,
   label, form Barang, pungutan per dokumen, jaminan, bank devisa, dan Dokumen Lartas sama persis
   dengan form hmx: susunannya dibangkitkan `scripts/import-customs-forms-from-hmx.py` ke
   `customs-layouts.generated.ts`; ubah pemetaan di script, bukan file hasilnya.
2. **Alur status mengikuti hmx** (keputusan user 20/10/2026, PRD 7.3, backlog H-01): Draft →
   Submitted lewat `submit_customs_document()`. Dokumen Submitted beserta semua bagiannya dikunci
   trigger database ("Dokumen … sudah Submitted dan tidak dapat diubah atau dihapus."); Draft boleh
   dihapus. Tidak ada Siap ajukan, Terdaftar, Ditolak, Batal, atau revisi bernomor versi.
3. **Nomor dokumen dan nomor aju seperti hmx**: nomor IT Inventory `IT/<kode>/<5 digit>` dibuat
   trigger dengan `next_number('customs_document:<kode>', 'all')`. No. Aju, No. Daftar, dan
   tanggalnya diisi manual dari portal CEISA; tidak ada pembangkit nomor aju.
4. **Field wajib sebagai data** (`doc_validation_rules` per `doc_code`), semua yang kurang
   dilaporkan sekaligus. Seed awalnya dari `check_required_fields()` Equip3, tapi periksa baris yang
   dikomentari dan cocokkan ke spesifikasi CEISA; jangan menyalin buta.
5. **Entitas sebagai baris per peran** (`customs_document_parties`): pengusaha, pemilik,
   pemasok/penjual, pembeli/penerima, PPJK. Terisi dari profil perusahaan dan partner
   (`companyAsCustomsParty`, `partnerAsCustomsParty`); NPWP memakai NITKU.
6. **Tanpa gerbang** (keputusan user 20/10/2026, mengikuti hmx): validasi transfer tidak menunggu
   dokumen BC, dan tidak ada alokasi dokumen asal. Jangan menambah kembali `customs_gate_errors()`
   atau `origin_allocations` tanpa keputusan baru di PRD.
7. **Dokumen memilih transfer** (Inventory Transfer Documents hmx) lewat `customs_document_transfers`,
   persis `DOCUMENT_SOURCE_MAP` hmx-002 (`customs_document_source_codes()`,
   `CUSTOMS_DOCUMENT_SOURCE_CODES`): BC 1.6/2.0/2.6.2 `gr`; BC 2.3, 4.0 `itw_in`, `itw_out`, `gr`;
   BC 2.5/2.6.1/2.8/3.0/P3BET `gi`; BC 2.7 keempatnya; BC 3.3 `gr`, `gi`; BC 4.1 `itw_in`, `itw_out`,
   `gi`. Hanya transfer Siap atau Selesai (`SOURCE_TRANSFER_STATES`). Submit wajib minimal satu
   transfer. Transfer hanya menampilkan dokumen yang memilihnya. Arah kode retur: `gr_rtn`
   pemasukan, `gi_rtn` pengeluaran (return_request hmx); jangan ikuti arah terbalik di
   `stock_card_service.py`/`mutation_report.py` hmx.
8. **Seri barang asal** mengikuti `source_sequence` hmx (dicatat per baris barang, menyusul H-04),
   bukan alokasi saldo asal.
9. **Laporan mutasi** (M5) sama bentuknya dengan hmx-002 dan sudah disiapkan M2-10:
   `warehouse_movements()` (masuk/keluar per gudang, perpindahan di dalam gudang tidak dihitung,
   dari/ke lokasi penyesuaian = penyesuaian) dan `period_balances` untuk periode tertutup. Kategori
   diambil dari salinan di `stock_moves.category`, bukan kategori produk saat ini (PRD 9.2), jadi
   laporan lama tidak berubah. Kolom opname/selisih seperti keterangan opname hmx-002.
10. **CEISA (fase 2)**: satu client di server seperti Equip3 (login, refresh token, retry), kirim
    dan cek status sebagai background job, `Idempotency-Key` dan cek status nomor aju sebelum kirim
    ulang (pelajaran dari hmx-002). Kredensial hanya di environment/secret manager, tidak pernah di
    tabel seperti kedua sistem lama. Selain production selalu host development.

## Rujukan cepat CEISA dari Equip3

- Host: `https://apisdev-gw.beacukai.go.id` (development), `https://apis-gw.beacukai.go.id`
  (production).
- Endpoint di `equip3_manuf_ceisa/models/endpoints.py` dan model `ceisa_documents_bcXX.py`:
  login `nle-oauth/v1/user/login`, refresh `auth-amws/v1/user/update-token`, kirim
  `openapi/document`, status `openapi/status/{nomorAju}`, kurs `openapi/kurs/{kodeValuta}`, TPS
  `openapi/gudangTPS/kodeKantor/{kode}`, manifes `v2/openapi/manifes-bc11`. Cek ulang ke
  dokumentasi CEISA: `endpoints.py` punya salah ketik (`{kodeValuta` tanpa kurung tutup) dan
  status memakai POST, sedangkan PRD mencatat GET.
- Kunci payload header (BC 2.3): `asalData`, `asuransi`, `bruto`, `cif`, `disclaimer`, `diskon`,
  `fob`, `freight`, `hargaPenyerahan`, `idPengguna`, `jabatanTtd`, `jumlahKontainer`,
  `kodeAsuransi`, `kodeDokumen`, `kodeIncoterm`, `kodeKantor`, `kodePelMuat`, `kodeTps`,
  `kodeValuta`, `kotaTtd`, `namaTtd`, `ndpbm`, `netto`, `nomorAju`, `seri`, `tanggalAju`,
  `tanggalTtd`, dan array `barang`, `entitas`, `dokumen`, `kemasan`, `kontainer`, `pengangkut`.
  Rancang kolom tabel dokumen supaya payload ini bisa dibangun tanpa data tambahan (PRD 10).

## Cara memakai sistem lama

- Cari dulu di kedua repo sebelum merancang field atau aturan dokumen BC baru, mis.
  `grep -rn "check_required_fields" -A60 <equip3_manuf_ceisa>/models/ceisa_documents_bc25.py`.
- Kode resmi (kantor, TPS, negara, satuan, HS, dst.) sudah ada di referensi kepabeanan repo ini;
  untuk memperbarui, jalankan ulang `scripts/import-ref-codes-from-odoo.ts`.
- Nama field dan istilah di repo ini berbahasa Inggris (snake_case) dan label UI berbahasa
  Indonesia; jangan membawa nama field Odoo (mis. `exim_*`, `sent_state`) apa adanya.
- Kalau sistem lama dan PRD berbeda, PRD yang berlaku. Catat perbedaan yang berarti di PRD
  bagian 15 bila keputusannya baru.
