---
name: inventory-alur-hmx
description: Panduan revisi alur inventory M0–M2 (gudang, lokasi, produk, transfer, stok, reservasi, backorder, transfer antar gudang, retur, scrap, opname, kartu stok) supaya mengikuti modul core_inventory hmx-002. Pakai setiap kali merencanakan, mengimplementasi, atau me-review revisi alur inventory, membuat tiket revisi M0–M2, atau menambah fitur inventory baru di repo ini.
---

# Revisi alur inventory mengikuti hmx-002

Keputusan user (14/10/2026): **alur inventory diambil dari hmx-002** (`core_inventory`), bukan dari
Equip3/Odoo. Dokumen BC, CEISA, dan laporan IT Inventory tetap mengikuti skill
`it-inventory-domain`. Skill ini memetakan alur hmx ke repo ini dan mencatat apa yang perlu diubah
di M0–M2 yang sudah jadi.

Rujukan utama: `~/hmx/hmx-002/hmx/module/basic/core_inventory` (Django, API mirip Odoo,
±170 ribu baris). Ekstensi IT Inventory-nya: `core_it_inventory` (`models/product.py`,
`models/inventory_transfer.py`).

| Topik                                                                | File di `core_inventory`                                                                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transfer (header, status, confirm/assign/validate/cancel, backorder) | `models/transfer.py`                                                                                                                                                                |
| Baris permintaan (demand)                                            | `models/stock_demand.py` (`_action_assign`, `_action_done`)                                                                                                                         |
| Baris pergerakan per lot/lokasi (move)                               | `models/stock_move.py` (`_action_done`, `_process_*_move`)                                                                                                                          |
| Saldo dan reservasi                                                  | `models/stock_balance.py` (`_update_reserved_quantity`, `_get_available_quantity`, `_lock_balances_for_update`)                                                                     |
| Kode pergerakan dan kelompok                                         | `data/movement_type_data.xml`, `data/type_group_data.xml`                                                                                                                           |
| Transfer antar gudang                                                | `models/iwt_request.py` (direct/transit), `_create_iwt_return_for_discarded_remaining` di `transfer.py`                                                                             |
| Retur                                                                | `models/return_request.py`, `return_request_line.py`                                                                                                                                |
| Scrap/pemakaian                                                      | `models/product_usage.py`, `models/usage_type.py`                                                                                                                                   |
| Stock opname                                                         | `models/stock_count.py` (`StockCount`, `StockCountLine`, `StockWarehouseFreeze`)                                                                                                    |
| Kartu stok                                                           | `models/stock_card_service.py`                                                                                                                                                      |
| Gudang dan lokasi                                                    | `models/warehouse.py`, `models/stock_location.py`                                                                                                                                   |
| Layanan pembuat transfer                                             | `services/inventory_transfer_service.py`, `docs/INVENTORY_TRANSFER_SERVICE.md`                                                                                                      |
| Tes perilaku                                                         | `tests/test_full_flow.py`, `test_reservation.py`, `test_backdate.py`, `test_negative_stock_prevention.py`, `test_iwt_full_flow.py`, `test_return_request.py`, `test_stock_count.py` |

## Alur hmx yang diambil

### Kelompok dan kode pergerakan

Setiap transfer punya `type_group` (arah) dan `movement_type` (kode). Kode ini yang menentukan
kolom kartu stok dan laporan mutasi, jadi simpan di setiap baris pergerakan.

| Kelompok | Kode                       | Arti                                                               | Padanan sekarang                       |
| -------- | -------------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| in       | `gr`                       | Penerimaan barang                                                  | `receipt`                              |
| out      | `gi`                       | Pengiriman barang                                                  | `delivery`                             |
| out      | `gr_rtn`                   | Retur ke vendor                                                    | `return` dari `receipt`                |
| in       | `gi_rtn`                   | Retur dari customer                                                | `return` dari `delivery`               |
| out / in | `itw_out` / `itw_in`       | Transfer antar gudang keluar/masuk                                 | `internal` beda gudang (satu transfer) |
| in       | `itw_rtn`                  | Sisa transit yang dikembalikan ke gudang asal                      | tidak ada                              |
| internal | `ilt` (`ilt_out`/`ilt_in`) | Pindah lokasi di dalam satu gudang                                 | `internal` gudang sama                 |
| out      | `pu`                       | Pemakaian/scrap (`usage_type`: usage, scrap, custom, transit_loss) | `scrap`                                |
| in / out | `adj_in` / `adj_out`       | Selisih stock opname (tambah/kurang)                               | `adjustment` dari opname               |

Tidak diambil: `gi_pick`/`gi_pack` (alur 2–3 langkah gudang), `repack_*`, `pkg_*`. Penyesuaian
manual tanpa opname tidak ada di hmx; di repo ini tetap ada (PRD 6.2) dan dipetakan ke
`adj_in`/`adj_out` dengan alasan wajib dan persetujuan Manajer.

### Status transfer

hmx: `draft` → (Confirm) → `confirmed` (menunggu stok) / `partially_available` / `ready` →
(Validate) → `done`; `cancelled` dari status mana pun sebelum done; `action_reset_draft`
mengembalikan ke Draft. `waiting_approval`/`rejected` bila alur persetujuan aktif.

- Confirm (`_validate_confirm`): wajib ada baris dan tanggal rencana, lokasi asal ≠ tujuan.
  Masuk (`gr`, `gi_rtn`) langsung `ready`; keluar butuh Check Availability.
- Check Availability (`action_assign`): reservasi stok per baris dari saldo lokasi asal (FIFO/FEFO
  per lokasi); status dihitung dari baris. Unreserve (`do_unreserve`) melepasnya.
- Validate (`button_validate`): urutannya pemeriksaan (`_sanity_check_validate`) → cek tanggal
  efektif mundur → cegah stok minus → konfirmasi backorder → `_action_done`.
- ILT (pindah lokasi di dalam gudang) boleh Validate langsung dari Draft: confirm + assign + validate
  sekaligus.

Repo ini sekarang: `draft` → `ready` → `done` / `cancelled`, tanpa reservasi.

### Demand dan move

hmx memisahkan **demand** (`stock_demand`: produk, qty diminta, qty selesai, satuan) dan
**move** (`stock_move`: qty per lot/lokasi/paket, `reserved_quantity`). Satu demand bisa punya
banyak move (mis. beberapa lot). Saldo hanya berubah dari move saat Done.

Repo ini sekarang: satu tingkat `stock_moves` (satu baris = satu produk/lot), qty diminta = qty
selesai. Revisi: tambah tabel `transfer_lines` (demand) dan jadikan `stock_moves` detail per
lot/lokasi milik baris itu. Ledger tetap `stock_moves` berstatus done.

### Tanggal efektif

`effective_date` boleh diisi (kosong = waktu validasi). Tanggal mundur memunculkan konfirmasi
"transaksi backdate" dan dicatat di `transaction_classification` (`backdate`, `backorder`,
`no_backorder`, `backdate_backorder`, `backdate_no_backorder`). Tanggal di periode tertutup ditolak.

Repo ini sekarang: `validate_transfer(id, at)` dengan tanggal efektif dan pemeriksaan periode
tertutup (M2-10) sudah sesuai; yang kurang hanya klasifikasi dan konfirmasi backdate di UI.

### Backorder

Saat Validate dengan qty selesai < qty diminta, user memilih **Buat backorder** (sisa jadi transfer
baru dengan `origin_transfer`) atau **Buang sisa** (tidak ada backorder; untuk IWT transit, sisa
di transit dikembalikan lewat `itw_rtn`). Repo ini: `split_backorder` (M2-05) membuat backorder
saja; tambahkan pilihan buang sisa dan klasifikasinya.

### Transfer antar gudang (IWT)

Dokumen permintaan `iwt_request` (`draft` → `confirm` → `in_progress` → `completed`/`cancelled`)
dengan `transfer_type`:

- **direct**: dibuat pasangan TRF-OUT (`itw_out`, gudang asal → lokasi virtual) dan TRF-IN
  (`itw_in`, lokasi virtual → gudang tujuan); TRF-IN tervalidasi otomatis saat TRF-OUT selesai.
- **transit**: pasangan yang sama, tapi TRF-IN divalidasi terpisah saat barang tiba; qty TRF-IN
  disinkronkan dari TRF-OUT; TRF-IN hanya bisa divalidasi setelah TRF-OUT selesai
  (`_validate_iwt_in_lifecycle`); sisa yang tidak diterima → `itw_rtn` atau transit loss (`pu`).

Repo ini: satu transfer `internal` langsung dari lokasi gudang A ke lokasi gudang B. Revisi:
pakai lokasi `transit` yang sudah ada sebagai perantara. Penting untuk kawasan berikat karena
barang di perjalanan antar gudang berikat bukan stok gudang mana pun.

### Retur

`return_request` (`draft` → `confirm` → `in_progress` → `done`, `cancelled`), `return_type`
vendor/customer, merujuk transfer Selesai (`transfer_ids`) atau tanpa rujukan
(`is_unreferenced`, wajib partner, gudang, lokasi). Per baris `action_type` (mis. retur saja atau
dengan pengganti); qty tidak melebihi sisa yang bisa diretur (`_check_qty_not_exceed_remaining`),
lot yang diretur tidak melebihi lot yang dikirim. Menghasilkan transfer `gr_rtn`/`gi_rtn` dan,
bila ada pengganti, transfer pengganti setelah retur selesai.

Repo ini: transfer `return` dengan `return_of_id` dan `returnable_lines` (M2-07). Retur tanpa
rujukan sebaiknya **tidak** diambil untuk gudang berikat (dokumen asal wajib, PRD 8.5).

### Scrap dan pemakaian

`product_usage` (`draft` → `confirmed` → `waiting_approval` → `validated`, `rejected`,
`cancelled`) dengan `usage_type` berkategori usage/scrap/custom/transit_loss, baris per lokasi asal,
kode pergerakan `pu`. Repo ini: transfer `scrap` dengan alasan dan persetujuan Manajer (M2-08);
revisi menambah jenis pemakaian dan memakai satu kode `pu`.

### Stock opname

`stock_count` (`draft` → Confirm → `in_progress` → Complete → `completed` → Validate →
`waiting_approval` → `validated`; `rejected` kembali ke `completed`; `cancelled`).

- Confirm membuat baris hitung dari saldo (`system_qty`) sesuai lingkup (semua produk, kategori,
  atau produk; boleh termasuk stok nol; qty hitung awal 0 atau = sistem) **dan membekukan gudang**
  (`stock_warehouse_freeze`): transfer di gudang itu tidak bisa divalidasi sampai opname selesai
  atau batal (`_check_warehouse_not_frozen`).
- Selisih menjadi demand `adj_in`/`adj_out` bertanggal `completed_date`.
- Nomor `ADJ/yy/mm/…`.

Repo ini (M2-09): `counting` → `review` → `approved`, qty sistem diambil per cut-off saat submit,
tanpa pembekuan gudang. Revisi: tambah pembekuan gudang (lebih sederhana dan sesuai praktik
opname di kawasan berikat) atau pertahankan cut-off; putuskan dulu bersama user.

### Kartu stok

Masuk: `gr`, `adj_in`, `gi_rtn`, `itw_in`, `itw_rtn`. Keluar: `gi`, `pu`, `adj_out`,
`gr_rtn`, `itw_out`. ILT (di dalam gudang) tidak mengubah saldo gudang. Repo ini (M2-11) sudah
menghitung per gudang; revisi tinggal menampilkan kode/jenis pergerakan sesuai daftar ini.

### Gudang, lokasi, produk

- Gudang hmx punya `view_location` (induk), `stock_location` (lokasi stok utama), dan opsional
  `input_location_id`/`output_location_id`/`packing_location_id` untuk alur 2–3 langkah.
  Ambil `stock_location` sebagai lokasi bawaan penerimaan/pengiriman; alur bertahap tidak diambil.
- Lokasi hmx: `usage` internal/view/virtual, `removal_strategy` FIFO/FEFO, `is_expired_location`.
  Repo ini memakai tipe yang lebih rinci (internal, transit, vendor, customer, scrap, adjustment);
  pertahankan, tambahkan strategi pengambilan bila reservasi dibuat.
- Produk, kategori, satuan, dan lot/serial: lihat skill `produk-hmx`.

## Yang tetap dari repo ini (jangan ikut hmx)

hmx menaruh aturan di kode Python (ORM). Repo ini menaruhnya di database, dan itu tetap:

- Aturan ledger, saldo, periode, dan perubahan status dipaksakan fungsi/trigger Postgres
  (`validate_transfer`, flag `app.ledger_write`); aksi server hanya memanggil fungsinya.
- **Stok tidak boleh minus**, selalu (hmx menjadikannya pengaturan `prevent_negative_stock`).
- Qty `numeric(18,4)` dalam satuan stok (hmx memakai float); konversi lewat `convert_qty`.
- Kategori dan gudang disalin ke pergerakan saat Done (PRD 9.2); periode tertutup tidak bisa
  ditulis; zona waktu WIB.
- Akses per gudang (`can_access_warehouse`), audit log, peran PRD; tanpa multi-company/branch.
- Tidak diambil: costing/valuasi (stock block, FIFO cost, revaluasi), konsinyasi, paket,
  gudang 3D, POD, batch picking, replenishment, cost center, antrean background, cetak.

## Cara mengerjakan revisi

1. Ubah PRD bagian 6 (dan 5.1 bila master data berubah) dulu, catat keputusan di PRD 15.4, lalu
   buat tiket revisi di tab Backlog (mis. `R2-01…`) dengan estimasi. Jangan mulai tanpa tiket.
2. Satu tiket = satu perubahan alur utuh: migrasi baru (jangan mengubah migrasi lama yang sudah
   jalan), migrasi data untuk transfer lama (status `ready` lama → `ready` baru; kode pergerakan
   diisi dari `type` + arah gudang), fungsi DB, aksi server, UI, tes DB dan e2e, README.
3. Urutan yang disarankan (dependensi dari atas ke bawah):
   1. Kode pergerakan + kelompok di transfer dan `stock_moves` (isi data lama), kartu stok
      memakai kode.
   2. Pisah demand (`transfer_lines`) dan move; qty diminta vs selesai.
   3. Confirm, Check Availability/reservasi (`stock_balances.reserved_qty`), Unreserve,
      reset ke Draft.
   4. Backorder: pilihan buang sisa + `transaction_classification`, konfirmasi backdate.
   5. IWT direct/transit lewat lokasi transit, `itw_rtn`.
   6. Retur sebagai dokumen permintaan (vendor/customer, pengganti).
   7. Pemakaian/scrap (`pu`, jenis pemakaian).
   8. Opname dengan pembekuan gudang (bila disetujui).
4. Sebelum menulis kode suatu bagian, baca file hmx terkait dan tesnya untuk kasus tepi
   (mis. `test_iwt_transit_loss.py`, `test_stock_count_no_stock_validation.py`), lalu tulis ulang
   dalam bentuk aturan database + tes Vitest/Playwright repo ini.
5. Label UI berbahasa Indonesia mengikuti skill `ui-it-inventory` (mis. Konfirmasi, Cek stok,
   Lepas reservasi, Validasi, Buat backorder, Buang sisa); kode pergerakan tampil sebagai label,
   bukan kode mentah.

## Keputusan user (14/10/2026)

- Revisi dikerjakan **sebelum M3**. Tiketnya ada di tab Backlog bagian R (alur, R-01–R-15) dan RU
  (tampilan per menu, RU-01–RU-19). Jangan mulai sebelum user minta.
- Reservasi stok saat Cek stok: **ya** (lot terlama dulu).
- Opname: **gudang dibekukan** selama opname berjalan.
- Transfer antar gudang: **lewat lokasi transit (virtual)**.
- Produk: kategori bertingkat dengan SKU otomatis, pelacakan per nomor seri, dan satuan khusus
  produk: **ya** (lihat skill `produk-hmx`). Kedaluwarsa lot, barcode terpisah, dan discontinue
  belum diputuskan, jadi jangan dikerjakan dulu.
