# IT Inventory

Aplikasi IT Inventory untuk perusahaan Kawasan Berikat: mencatat pergerakan barang di gudang berikat
dan menghubungkannya dengan dokumen BC. Spesifikasi lengkap ada di PRD.

Stack: Next.js 16 (App Router, React, Tailwind CSS, shadcn/ui), PostgreSQL 16, Drizzle ORM,
Better Auth.

## Kebutuhan

- Node.js 24 LTS (versi utama di `.nvmrc`; jalankan `nvm install && nvm use` bila memakai nvm)
- Docker dengan plugin Compose

## Menjalankan di lokal

```bash
npm install
cp .env.example .env.local
# isi BETTER_AUTH_SECRET (openssl rand -base64 32) dan SEED_ADMIN_PASSWORD di .env.local
npm run db:up        # Postgres 16 di Docker, port 5433
npm run db:migrate   # terapkan semua migrasi
npm run db:seed      # data awal + akun Administrator (aman dijalankan berulang)
npm run dev          # http://localhost:3000, menyalakan database dan menerapkan migrasi baru
```

Login dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` dari `.env.local`. Sign-up publik
dimatikan: user baru dibuat oleh Administrator.

## Agent Telegram

Agent OpenCode bisa dikendalikan lewat Telegram untuk mengerjakan perubahan kode dari HP. Agent
selalu bekerja di branch `agent/<slug>` dan membuka PR ke `main`; merge tetap dilakukan user.
Push ke `main` diblokir hook `scripts/git-hooks/pre-push`, dan `opencode.jsonc` meminta persetujuan
sebelum push. Panduan lengkap ada di `docs/telegram-agent.md`.

## Auth

- Better Auth, endpoint di `/api/auth/*`. Konfigurasi di `src/server/auth/index.ts`.
- Baca sesi hanya lewat `getSession()` / `requireUser()` di `src/server/auth/session.ts`, dan
  panggil dari komponen yang dibungkus `<Suspense>` (aturan `cacheComponents` di Next 16).
- `src/proxy.ts` hanya mengecek keberadaan cookie untuk redirect cepat ke `/login`. Validasi
  sesi yang sebenarnya tetap di server.
- Tabel auth (`users`, `sessions`, `accounts`, `verifications`) di
  `src/server/db/schema/auth.ts`. Kalau menambah plugin Better Auth, generate ulang dengan
  `npx auth@latest generate` lalu sesuaikan dengan konvensi repo.

## Integrasi CEISA

- Buka **Pengaturan › Integrasi CEISA**, lalu pilih **Hubungkan** untuk autentikasi akun
  perusahaan. Fitur ini belum mengirim dokumen BC atau memperbarui status pendaftarannya.
- Login CEISA terpisah dari login IT Inventory. Di Pengaturan pilih **Edit**, isi **Username CEISA**
  dan **Password CEISA**, lalu **Simpan** sebelum **Hubungkan**. Satu tombol Simpan di atas form
  menyimpan pengaturan sistem dan CEISA sekaligus; **Buang** membatalkan draft. Password kosong mempertahankan password
  tersimpan untuk username yang sama; mengganti username wajib mengisi password baru.
- **Bea Cukai API key** opsional, disimpan terenkripsi dan tidak dimuat kembali ke browser.
  Kosongkan untuk mempertahankan key tersimpan. Key ini belum digunakan oleh autentikasi CEISA.
- Pilihan **Lingkungan CEISA** disimpan di database (`system_settings`, key `ceisa.environment`),
  bukan env server. Production memakai `https://apis-gw.beacukai.go.id`; Development memakai
  `https://apisdev-gw.beacukai.go.id`. Instalasi ini memakai Production sesuai URL Postman.
  Endpoint login adalah `/nle-oauth/v1/user/login`,
  mengikuti konfigurasi login perusahaan Equip3-moduleboard. Verifikasi endpoint dan kontrak
  respons terhadap dokumentasi CEISA terbaru sebelum dipakai di produksi.
- Password, token akses, dan refresh disimpan di `ceisa_connections` dengan enkripsi AES-256-GCM.
  Sebaiknya isi `CEISA_TOKEN_KEY` dengan kunci base64 32 byte (`openssl rand -base64 32`).
  Jika kosong, kunci diturunkan dari `BETTER_AUTH_SECRET`. Perubahan kunci membuat token lama
  tidak terbaca; isi ulang password dan hubungkan ulang setelah rotasi kunci.
- Hanya pengguna dengan izin `settings:write` yang dapat menghubungkan akun. Hasil percobaan
  dicatat di audit log; kolom password dan token dikecualikan dan respons mentah tidak disimpan
  di log. Token tidak pernah dimuat ke browser. Password tersimpan tidak dimuat saat membuka halaman;
  Administrator dapat memintanya secara eksplisit lewat tombol mata pada field password di mode edit.
- Unit test memakai fetch tiruan. Tes Playwright memakai database kosong dan tidak menghubungkan
  akun setelah kredensial diisi, sehingga tidak menghubungi layanan CEISA sungguhan.

## Script

| Script                                    | Fungsi                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Server development (nyalakan database, lalu migrasi) |
| `npm run lint` / `npm run typecheck`      | ESLint dan pengecekan TypeScript                     |
| `npm run check`                           | Lint, typecheck, dan pemeriksaan format              |
| `npm run format` / `npm run format:check` | Prettier                                             |
| `npm run db:up` / `npm run db:down`       | Nyalakan / matikan Postgres di Docker                |
| `npm run db:generate -- --name=<nama>`    | Buat migrasi dari perubahan schema Drizzle           |
| `npm run db:custom -- <nama>`             | Buat file migrasi SQL kosong (fungsi, trigger, view) |
| `npm run db:migrate`                      | Terapkan migrasi                                     |
| `npm run db:seed`                         | Isi data awal                                        |
| `npm run db:reset`                        | Hapus database lokal, lalu migrasi dan seed ulang    |
| `npm run db:studio`                       | Drizzle Studio untuk melihat isi database            |
| `npm test` / `npm run test:watch`         | Unit test dan tes database (Vitest)                  |
| `npm run test:e2e`                        | Tes end-to-end di browser (Playwright)               |

## Layout dan halaman

- Halaman setelah login ada di route group `src/app/(app)/` dan memakai layout dengan sidebar.
  `/login` dan `/akun/mfa` sengaja di luar layout itu.
- Menu sidebar diatur di `src/lib/navigation.ts` (judul, ikon, izin, tiket yang mengisinya). Menu
  hanya menyembunyikan; setiap halaman tetap memanggil `requirePermission()` sendiri.
- Modul yang belum dikerjakan memakai `<ModulePlaceholder href="..." />`. Saat modulnya dibuat, ganti
  isi `page.tsx`-nya dan hapus `plannedIn` di menu.
- Halaman daftar memakai komponen di `src/components/data-table/`: pencarian, filter, dan pagination
  disimpan di URL (`?q=`, `?page=`, filter), lalu query dijalankan di server. Contoh lengkap:
  `src/app/(app)/admin/users/page.tsx` dengan query `src/server/queries/users.ts`.
- Form memakai `defineFormAction` + `useActionState`. React me-reset form setelah action selesai, jadi
  isi field diambil lewat `fieldValue(state, "nama", nilaiTersimpan)` supaya ketikan user tidak
  hilang saat validasi gagal.
- Bagian yang membaca sesi atau `searchParams` dibungkus `<Suspense>`, supaya layout dan judul halaman
  ikut di-prerender (aturan `cacheComponents`).

## Referensi kepabeanan

- Halaman daftar (RM-04) dibuka sebagai ringkasan per jenis (jumlah aktif dan diarsipkan,
  `summarizeRefCodes()`); klik jenis untuk melihat isinya. Hasil cari tanpa jenis dikelompokkan per
  jenis.
- Tabel `ref_codes` (jenis, kode, nama, `parent_code`, aktif). Daftar jenis dan labelnya di
  `src/lib/ref-codes.ts`. TPS unik per kantor pabean dan pelabuhan luar negeri unik per negara, jadi
  keduanya memakai `parent_code`.
- Data awal ada di `src/server/db/seed-data/ref-codes/*.csv` dan dipasang oleh `npm run db:seed`
  (baris yang sudah ada tidak ditimpa). CSV dibuat dari modul Odoo lama:

  ```bash
  npx tsx scripts/import-ref-codes-from-odoo.ts \
    ~/odoo14/Equip3-moduleboard/core/equip3_manuf_it_inventory ~/odoo14/odoo14/odoo/addons/base/data
  ```

  Nama negara dan valuta diambil dari data CLDR (`Intl.DisplayNames`, bahasa Indonesia).

- Pilihan referensi di form memakai `<RefCodeSelect type="..." name="..." />`, tampil sebagai
  `[kode] nama` dan mencari ke `/api/ref-codes`. Referensi yang diarsipkan tidak muncul sebagai
  pilihan.
- Hanya Administrator (izin `ref:write`) yang bisa menambah, mengubah nama, atau mengarsipkan.

## Profil perusahaan

- Tabel `company` hanya satu baris (dipaksa di database). NPWP disimpan 16 digit, NITKU 22 digit
  (kosong di form = NPWP + `000000`), NIB 13 digit. Aturan NPWP/NITKU ada di `src/lib/npwp.ts` dan
  dipakai juga untuk partner.
- Untuk dokumen BC, ambil profil dengan `getCompanyProfile()` lalu `companyAsCustomsParty()` sebagai
  entitas Pengusaha/Pemilik.

## Gudang, lokasi, dan akses gudang

- `warehouses` (semua gudang adalah gudang berikat sejak RM-02; kolom `is_bonded` dan kategori gudang
  dihapus), `locations` (hierarki lewat `parent_id`, jalur
  lengkap di view `location_paths`), dan `user_warehouses`.
- Aturan lokasi dipaksakan trigger dan CHECK di database: lokasi internal wajib di dalam gudang;
  vendor, customer, dan penyesuaian adalah lokasi virtual di luar gudang; induk harus satu gudang dan
  tidak boleh melingkar; kode, tipe, dan gudang lokasi serta kode gudang tidak bisa diubah.
- Akses gudang hanya lewat fungsi database `can_access_warehouse(user, gudang)`: Administrator,
  Manajer, dan Auditor melihat semua gudang (`ALL_WAREHOUSE_ROLES`), peran lain hanya gudang yang
  diberikan di halaman detail Pengguna (`/admin/users/[id]`, RM-02). Gudang tanpa akses
  diperlakukan seperti tidak ada (404).
- Lokasi virtual VENDOR, CUSTOMER, SCRAP, PENYESUAIAN, dan TRANSIT dibuat oleh seed. PENYESUAIAN
  tetap dipakai opname dan penyesuaian, tapi tidak ditampilkan di halaman Gudang.
- Lokasi stok utama gudang (`warehouses.stock_location_id`, I-07, `stock_location` hmx): lokasi
  internal aktif di gudang itu (trigger `warehouses_stock_location_guard`), terisi otomatis dengan
  lokasi internal teratas pertama yang dibuat, tidak bisa diarsipkan selama dipakai, dan menjadi
  lokasi baris produk tanpa stok di opname seluruh gudang. Daftar gudang menandai gudang yang sedang
  dibekukan opname; detail produk menampilkan stok per gudang (`productStockByWarehouse`).

## Satuan dan konversi

- `uom_categories` dan `uoms`. `factor` = berapa satuan acuan dalam 1 satuan (acuan selalu 1, tepat
  satu per kategori), misalnya kategori Berat dengan acuan KG: G = 0,001, TON = 1000.
- Konversi qty hanya lewat fungsi database `convert_qty(qty, dari, ke)`: menolak kategori berbeda,
  membulatkan ke kelipatan `rounding` satuan tujuan (default 0,0001; mis. 1 untuk PCS supaya qty
  selalu utuh), lalu ke 4 desimal. Angka desimal tidak pernah dihitung sebagai float di aplikasi
  (`src/lib/decimal.ts` hanya mengurai input dan memformat tampilan).
- Satuan khusus produk (`uoms.product_id`, backlog R-03), mis. 1 BOX = 24 PCS hanya untuk satu
  produk: harus sekategori dengan satuan stok produknya dan hanya bisa dipakai di baris transfer
  produk itu (trigger `stock_moves_before_write`). Kode unik per lingkup: kode satuan umum tidak
  boleh sama dengan kode satuan khusus mana pun, dua produk boleh punya satuan khusus berkode sama.
  Satuan stok produk selalu satuan umum.
- Kode, kategori, status acuan, dan produk satuan tidak bisa diubah. Satuan dasar (PCS, KG, L, M, M2, dan
  turunannya) dibuat oleh seed. Satuan CEISA (kode resmi) ada di referensi kepabeanan dan dipilih per
  baris dokumen BC (M3).

## Produk

- Tabel `products`. Qty selalu dalam satuan stok (`uom_id`); product code (kolom `sku`) dan satuan
  stok tidak bisa diubah. Di UI, import, dan export kolom `sku` berlabel "Product code".
- Untuk dokumen BC produk cukup punya kode HS: `customs_ready` = `hs_code is not null`; dokumen BC
  (M3) hanya boleh memilih produk dengan `customs_ready = true`. Satuan CEISA beserta konversinya
  diisi per baris dokumen BC. Berat netto, satuan CEISA, dan faktornya dihapus dari produk di RM-01;
  import mengabaikan kolom lama itu.
- Kode HS (11.555, BTKI 8 digit) dan satuan CEISA (1.513, UN/ECE Rec 20) adalah jenis referensi
  `hs_code` dan `ceisa_unit`, dari data Odoo lama. Data HS Odoo kehilangan nol di depan pada sebagian
  kode; script impor mengembalikannya. Sebagian besar uraian HS berbahasa Inggris dan disingkat.
- Helper zod untuk field form ada di `src/lib/form-fields.ts`; pengecekan kode referensi di
  `src/server/db/ref-code-checks.ts`.

## Pelacakan lot dan nomor seri

- `products.tracking` (backlog R-02): `none`, `lot`, atau `serial`; menggantikan `lot_required`
  (data lama: wajib lot = `lot`). Tidak bisa diubah selama produk punya stok di lokasi gudang atau
  transaksi yang belum Selesai (trigger `products_tracking_guard`).
- Aturan di `transfer_tracking_errors()`, dipakai Konfirmasi dan validasi: produk berpelacakan
  wajib punya lot/nomor seri; nomor seri ber-qty 1 dalam satuan stok dan hanya boleh ada satu di
  seluruh lokasi gudang (boleh masuk lagi setelah keluar).
- Nomor otomatis: produk dengan `lot_auto` (nomor = product code + "-" + nomor urut sepanjang
  `lot_digits`, mis. `BRG-0001-000001`; RM-01) yang diterima dari luar gudang
  (penerimaan, penyesuaian tambah) dengan lot kosong diberi nomor saat validasi oleh
  `assign_auto_lots()`: per lot satu lot baru per baris, per nomor seri baris qty n dipecah jadi n
  baris ber-qty 1. Nomor urut `next_number('lot:<id produk>', '')` ikut batal bila validasi gagal.
- `validate_transfer()` sekarang memanggil `transfer_validation_errors()` untuk semua syarat
  (akses, tanggal, periode, persetujuan, pelacakan, stok, retur).
- Import/export produk: kolom Pelacakan (judul lama "Wajib lot" dengan Ya/Tidak tetap diterima),
  Nomor lot/seri otomatis (Ya/Tidak; kolom lama "Prefix nomor lot/seri" yang terisi dianggap Ya),
  Digit nomor lot/seri.

## Kategori produk dan SKU otomatis

- Tabel `product_categories` (backlog R-01): bertingkat lewat `parent_id`, jalur lengkap
  ("Bahan baku / Logam") dari view `product_category_paths`. Halaman `/master/kategori-produk`.
- Kategori produk (`products.category_id`, boleh kosong) terpisah dari kategori IT Inventory
  (`products.category`, wajib, dipakai laporan BC).
- Aturan di database (migrasi `product_categories_rules`): induk tidak boleh membentuk lingkaran
  dan tidak boleh kategori arsip, nama unik di antara kategori seinduk dan tanpa "/", prefix kode
  unik (huruf besar, angka, `-`, `/`, maks. 10), jumlah digit 3–10. Kategori yang punya produk
  atau sub-kategori tidak bisa dihapus.
- SKU otomatis: produk baru dengan SKU kosong mendapat `prefix + nomor urut kategori` (trigger
  `products_before_write` → `next_product_sku()`), mis. `BB-000001`. Nomor urut memakai
  `next_number('sku:<id kategori>', '')`, jadi aman saat produk dibuat bersamaan; nomor yang sudah
  dipakai SKU manual dilewati dan nomor yang lebih panjang dari jumlah digit tidak dipotong. SKU
  kosong ditolak bila kategori tidak dipilih atau tidak punya prefix.
- Import/export produk punya kolom "Kategori produk" berisi jalur lengkap (huruf besar/kecil dan
  spasi di sekitar "/" diabaikan). Kolom kategori IT Inventory sekarang berjudul "Kategori IT
  Inventory"; judul lama "Kategori" tetap diterima (`aliases` di `ImportColumn`). Import tetap
  mewajibkan SKU karena baris dicocokkan lewat SKU.

## Partner

- Tabel `partners`: negara, jenis identitas dan nomornya (label "NPWP" di UI; NPWP 16/15 digit,
  paspor, KTP, lainnya; kode CEISA 6/5/2/3/4), NITKU. Sejak RM-03 tidak ada peran vendor/customer
  (semua partner bisa dipilih di penerimaan dan pengiriman) dan kode partner dibuat database
  (`PRT-000001`, sequence `partners_code_seq`) tanpa ditampilkan. Panjang isian NPWP di form
  mengikuti jenis identitas (`IDENTITY_MAX_LENGTH`).
- NITKU hanya untuk NPWP dan otomatis bila dikosongkan: NPWP 16 digit + `000000`, atau `0` + NPWP 15
  digit + `000000`. NITKU cabang boleh diisi asal diawali NPWP 16 digit. Konsistensinya dipaksakan
  di database dan NITKU unik antar partner.
- Untuk dokumen BC: `partnerAsCustomsParty()` (NPWP memakai NITKU sebagai nomor identitas).
- Pemeriksaan lintas field di zod memakai `superRefine(..., { when: () => true })` supaya tetap
  berjalan walaupun field lain gagal, sehingga semua kesalahan tampil sekaligus.

## Inventory

- Stok dihitung dari ledger `stock_moves` berstatus `done` (PRD bagian 6). `transfers` adalah
  dokumen operasionalnya (penerimaan, pengiriman, pindah lokasi, transfer antar gudang, retur,
  pemakaian & scrap, penyesuaian) dengan status Draft → Menunggu / Sebagian tersedia / Siap →
  Selesai atau Batal (R-06), baris permintaan `transfer_lines` (R-05), dan kode pergerakan (R-04). `stock_balances` hanya ringkasan per produk ×
  lokasi × lot; lot kosong dihitung satu nilai (`NULLS NOT DISTINCT`).
- Nomor transfer dibuat database saat insert, per jenis dan tahun WIB (`PNR/2026/00001`), lewat
  `next_number(lingkup, periode)` yang aman dipanggil bersamaan. Pembuat diisi dari `app.user_id`.
- Aturan di trigger (migrasi `inventory_rules`): asal dan tujuan harus sesuai jenis transfer
  (penerimaan: vendor → internal, pengiriman: internal → customer, dst.), retur hanya dari
  penerimaan/pengiriman Selesai dengan arah terbalik dan partner yang sama, data arsip (lokasi,
  partner, produk) tidak bisa dipakai untuk transaksi baru, lot harus milik produknya, dan lokasi
  baris harus sesuai lokasi transfernya (sub-lokasi di gudang yang sama boleh).
- Qty baris diinput dalam satuan apa pun (`input_qty`, `input_uom_id`); database menghitung `qty`
  dalam satuan stok produk lewat `convert_qty`. Gudang asal/tujuan disalin ke baris untuk laporan.
- Baris permintaan (backlog R-05, mengikuti `stock_demand` hmx-002): `transfer_lines` menyimpan
  produk dan qty diminta; `stock_moves.line_id` wajib, dan pergerakan adalah rincian yang benar-benar
  bergerak (per lot/lokasi, bisa beberapa per baris). Total pergerakan per baris tidak boleh
  melebihi qty diminta (`transfer_line_errors()`); `done_qty` diisi `validate_transfer()`. Form
  membuat satu pergerakan per baris sebesar qty diminta. `split_backorder(transfer, {id baris:
qty selesai})` dipanggil setiap validasi: qty diminta di baris asal tetap, sisanya menjadi baris
  transfer lanjutan beserta lot dan lokasinya. Baris transfer Selesai/Batal terkunci
  (`transfer_lines_lock`). Data lama: setiap pergerakan mendapat satu baris dengan id yang sama.
- Kode pergerakan (backlog R-04, mengikuti hmx-002): `transfers.movement_code` diisi trigger dari
  jenis dan lokasi transfer (`transfer_movement_code()`): `gr` penerimaan, `gi` pengiriman, `ilt`
  pindah lokasi di dalam gudang, `itw_out`/`itw_in` keluar ke/masuk dari transit atau ke gudang
  lain, `gr_rtn`/`gi_rtn` retur ke vendor/dari customer, `pu` scrap/pemakaian, `adj_in`/`adj_out`
  penyesuaian (`itw_rtn` dipakai mulai R-10). `direction` (in/out/internal) kolom turunan. Kode
  disalin ke `stock_moves.movement_code` saat validasi; kartu stok dan `warehouse_movements`
  membacanya. Label di `MOVEMENT_CODE_LABELS` (`src/modules/inventory/lib/inventory.ts`).

- Alur status (backlog R-06): Draft → `confirm_transfer()` → Menunggu / Sebagian tersedia / Siap
  → Selesai. Konfirmasi mewajibkan baris, tanggal rencana (kosong di form = hari ini), alasan untuk
  scrap/penyesuaian, pelacakan, dan batas retur (`transfer_confirm_errors()`). Transfer masuk
  langsung Siap; transfer yang mengambil stok gudang dinilai `transfer_availability()` (Siap bila
  stok cukup, Sebagian tersedia bila sebagian ada, Menunggu bila tidak ada) dan bisa dicek ulang
  lewat `check_transfer_availability()` (tombol Cek stok). `reset_transfer_to_draft()` dan
  `cancel_transfer()` untuk Kembali ke Draft dan Batal (dari status mana pun sebelum Selesai).
  Trigger `transfers_status_guard` menolak perubahan status di luar fungsi-fungsi itu; transfer
  baru selalu Draft. Validasi tetap bisa dipanggil sistem dari Draft (opname, tes); UI menampilkan
  Validasi untuk Siap dan Sebagian tersedia.
- Reservasi stok (backlog R-07): transfer yang mengambil stok gudang memesan stok saat
  Konfirmasi dan Cek stok (`reserve_transfer()`): `stock_balances.reserved_qty` dan
  `stock_moves.reserved_qty`, tersedia = saldo − dipesan. Pergerakan produk berpelacakan tanpa lot
  memesan dari lot terlama (`lots.created_at`) dan dipecah per lot. Saldo dikunci dulu, jadi dua
  transfer yang dikonfirmasi bersamaan tidak memesan stok yang sama. `unreserve_transfer()`
  dipanggil saat Lepas reservasi (`release_transfer_reservation()`, status kembali Menunggu),
  Kembali ke Draft, Batal, dan di awal validasi; pengecekan stok saat validasi
  (`transfer_stock_errors()`) memakai saldo dikurangi pesanan transfer lain. Petunjuk "Tersedia" di form memakai saldo − dipesan.
- Sisa qty dan klasifikasi (backlog R-08): saat validasi user memilih Buat transfer lanjutan
  (default) atau Buang sisa (`split_backorder(..., p_create_backorder)`); qty diminta tetap
  tercatat di baris. `validate_transfer()` mengisi `transfers.classification`
  (`transfer_classification()`): `backorder` bila ada transfer lanjutan atau transfer ini sendiri
  lanjutan, `no_backorder` bila sisa dibuang, `backdate` bila tanggal efektif sebelum hari ini (WIB),
  atau gabungannya. Tanggal efektif mundur (Manajer) wajib dicentang konfirmasinya di dialog.
- Pindah lokasi (backlog R-09, menu "Pindah lokasi" di `/inventory/transfer`): transfer internal
  antar dua lokasi internal hanya di dalam satu gudang (trigger `transfers_before_write`; transfer
  lama antar gudang tidak terpengaruh). Barang antar gudang dipindah lewat lokasi transit (R-10).
  Pindah lokasi (`ilt`) boleh divalidasi langsung dari Draft: aksi `validateTransfer` memanggil
  `confirm_transfer()` (pesan stok) lalu validasi dalam satu transaksi; transfer lain harus
  dikonfirmasi dulu.
- Transfer antar gudang (backlog R-10, menu `/inventory/antar-gudang`, mengikuti `iwt_request`
  hmx-002 tipe transit): dokumen `interwarehouse_transfers` (nomor `ITW/tahun/urut`, status Draft →
  Dikonfirmasi → Di perjalanan → Selesai, atau Batal sebelum barang keluar) dengan barisnya.
  `confirm_interwarehouse()` membuat transfer keluar (lokasi asal → lokasi `TRANSIT`, `itw_out`) dan
  memesan stok. Saat transfer keluar Selesai, trigger `interwarehouse_after_transfer_done` membuat
  transfer masuk (transit → lokasi tujuan, `itw_in`) sebesar qty dan lot yang keluar. Barang di jalan
  tercatat di lokasi transit (tanpa gudang), jadi tidak masuk stok gudang mana pun
  (`interwarehouse_in_transit()`). Transfer dari transit tidak boleh melebihi yang masih di
  perjalanan. Sisa di transit diselesaikan `settle_interwarehouse()`: kembali ke lokasi asal
  (`itw_rtn`) atau susut transit (scrap dari transit, alasan wajib, disetujui Manajer). Permintaan
  otomatis Selesai bila transit kosong dan tidak ada transfer terbuka. Transfer lanjutan
  (backorder) ikut membawa `interwarehouse_id`. Lokasi `TRANSIT` dibuat migrasi dan seed.
  Sejak I-05 daftar punya kolom dan filter "Di perjalanan" (`?transit=ada`), dan detail menampilkan
  qty per produk: diminta, dikirim, diterima, kembali/susut, di perjalanan, dan belum dikirim (qty di
  transfer keluar yang masih terbuka).
- Pindah lokasi lewat scan (`/inventory/transfer/scan`, I-05): pindai lokasi asal, lokasi tujuan
  (gudang yang sama), lalu barang (dan lot/nomor seri); `moveByScan` membuat transfer `ilt`,
  mengonfirmasi, dan memvalidasinya dalam satu transaksi.
- Transfer hanya bisa Selesai lewat fungsi database `validate_transfer(transfer, tanggal_efektif)`
  (migrasi `validate_transfer`). Fungsi itu memeriksa semua syarat dan melaporkan semua alasan
  sekaligus (satu per baris pesan): ada baris barang, akses gudang user, tanggal efektif (backdate
  hanya Manajer, tidak boleh masa depan), alasan dan persetujuan untuk scrap/penyesuaian, nomor lot
  untuk produk wajib lot, stok cukup (selalu; stok di lokasi gudang
  tidak pernah boleh minus, pengaturan `inventory.allow_negative_stock` dihapus di RM-02). Dokumen BC tidak menahan validasi
  (H-01, mengikuti hmx). Bila lolos, baris menjadi Selesai dengan salinan kategori produk, saldo diperbarui, dan
  transfer dikunci, semuanya dalam satu transaksi. Saldo dikunci baris per baris, jadi dua
  validasi bersamaan tidak bisa menghabiskan stok yang sama.
- Trigger menolak: perubahan dan penghapusan transfer/baris Selesai atau Batal, baris baru di
  transfer Selesai, status Selesai di luar validasi, dan tulisan langsung ke `stock_balances`.
  Pengecualiannya penanda transaksi `app.ledger_write`, yang dinyalakan fungsi database sendiri.
  Koreksi selalu lewat transaksi baru (retur atau penyesuaian). Membatalkan transfer ikut
  membatalkan barisnya.
- Tes yang butuh data Selesai memakai `enableLedgerWrite()`, dan membersihkannya dengan
  `purgeInventory()` (`tests/shared/db/helpers.ts`).

- Tutup periode bulanan (`/inventory/periode`, Manajer): `close_period(tahun, bulan)` menyimpan
  `period_balances` (saldo awal, masuk, keluar, penyesuaian, saldo akhir per produk × gudang ×
  kategori) dan mengunci periodenya. Penutupan berurutan tanpa melompati bulan; semua tanggal
  sampai akhir periode tertutup terakhir ditolak untuk transaksi baru (`period_is_closed`), baik di
  `validate_transfer` maupun lewat trigger. Masuk/keluar dihitung per gudang: perpindahan di dalam
  gudang yang sama tidak dihitung, kode `adj_in`/`adj_out` masuk kolom penyesuaian
  (`warehouse_movements`). Batas bulan selalu WIB lewat `period_start`/`period_end`; jangan pakai
  `+ interval '1 month'` pada timestamptz.

- Tampilan stok (`/inventory/stok`): saldo sekarang dari `stock_balances`; filter "Saldo per"
  tanggal menghitung dari ledger lewat `stock_on_hand(end_of_day(tanggal))`, dan untuk hari ini
  hasil keduanya sama. Kartu stok (`/inventory/stok/[produk]`) per gudang dan rentang tanggal:
  saldo awal, masuk, keluar, saldo berjalan, dengan tautan ke transfernya.
- Backlog R-14: saldo sekarang juga menampilkan Dipesan (`stock_balances.reserved_qty`) dan
  Tersedia; saldo per tanggal hanya saldo. Jenis pergerakan di kartu stok dibaca dari kode
  (`movementLabel()`, kode `pu` dirinci per jenis pemakaian) dan arahnya sama dengan
  `movement_direction()` (`MOVEMENT_CODE_DIRECTIONS`). Penelusuran lot/nomor seri
  (`/inventory/lot`, `src/modules/inventory/server/queries/lots.ts`): saldo per lokasi (dipesan, tersedia) dan riwayat
  masuk-keluar di semua gudang yang boleh diakses, dengan partner dan tautan transfer.
  `tests/db/inventory/stock-card.test.ts` memastikan saldo kartu stok sama dengan saldo per tanggal untuk
  setiap kode pergerakan.

## Layar transaksi inventory

- Halaman daftar, buat, dan detail sama untuk semua jenis transfer: `src/modules/inventory/components/`
  (`transfer-pages.tsx`, `transfer-form.tsx`, `transfer-actions.tsx`). Halaman di
  `src/app/(app)/inventory/<jenis>/` hanya meneruskan konfigurasi jenisnya dari `TRANSFER_KINDS`
  (`src/modules/inventory/lib/transfer.ts`): sisi gudang yang dipilih user, label partner, dan lokasi virtual lawannya.
- Server action di `src/modules/inventory/actions/transfers.ts`: simpan Draft (baris dikirim sebagai JSON,
  lot dibuat otomatis per produk), Konfirmasi, Cek stok, Lepas reservasi, kembali ke Draft,
  validasi (memanggil `validate_transfer`, tanggal efektif mundur hanya untuk Manajer), dan batal.
- Barang keluar (pengiriman, pindah lokasi, transfer antar gudang keluar, retur ke vendor, pemakaian):
  Konfirmasi dan Cek stok memesan stok (`reserve_transfer()`, R-07), validasi memeriksa stok dengan
  `transfer_stock_errors()`, lot dipilih dari lot
  yang masih ada stoknya di lokasi asal (`/api/stock-availability`, juga menampilkan jumlah
  tersedia), dan lot yang tidak ada ditolak. Barang masuk boleh membawa lot baru.
- Parsial (backorder): di dialog Validasi qty selesai per baris bisa dikurangi. Fungsi database
  `split_backorder(transfer, {baris: qty})` memindah sisanya ke transfer lanjutan (Draft,
  `backorder_of_id` = transfer asal) sebelum `validate_transfer`, dalam transaksi yang sama.
- Produk dan partner dicari lewat `/api/products` dan `/api/partners` dengan komponen
  `SearchSelect`. Input baris barang punya target sentuh 44px di perangkat sentuh
  (`pointer-coarse:`).
- Pindah lokasi: kedua lokasi dipilih user di satu gudang, tanpa partner; antar gudang selalu lewat
  permintaan transfer antar gudang dan lokasi transit (R-09, R-10).
- Retur adalah dokumen permintaan (`/inventory/retur`, backlog R-11, `return_requests` +
  `return_request_lines`, nomor `PRT/tahun/urut`): dibuat dari penerimaan (retur ke vendor) atau
  pengiriman (retur dari customer) yang Selesai lewat tombol "Buat retur". Retur tanpa rujukan
  tidak ada. Baris berisi sisa per produk × lot (`returnable_lines(asal, kecuali_permintaan)`: qty
  asal dikurangi retur Selesai dan qty permintaan lain yang transfer returnya masih terbuka); di
  Draft yang diubah lokasi gudang, tanggal, alasan, qty (0 = tidak diretur), dan tindakan per baris
  (retur saja / retur dengan pengganti).
- Konfirmasi (`confirm_return_request()`) mengunci transfer asal, memeriksa qty
  (`return_request_errors()`), lalu membuat transfer retur (`gr_rtn`/`gi_rtn`, sudah dikonfirmasi,
  retur ke vendor memesan stok). Transfer retur hanya bisa dibuat lewat permintaan
  (`transfers.return_request_id`, trigger `transfers_return_request_check`) dan tidak diubah lewat
  form; parsial memakai pilihan lanjutan/buang sisa biasa (`split_backorder` ikut menyalin
  permintaannya).
- Setelah semua transfer retur Selesai/Batal, `refresh_return_request()` membuat transfer pengganti
  (Draft) untuk baris dengan pengganti sebesar qty yang benar-benar diretur: penerimaan dari vendor
  atau pengiriman ke customer. Pengganti bisa diubah (mis. mengisi lot) tapi tidak melebihi qty yang
  diretur (`return_request_transfer_errors()`, dicek saat Konfirmasi dan validasi). Permintaan
  Selesai bila tidak ada transfer terbuka lagi; membatalkan pengganti = ditutup tanpa pengganti.
  Batal hanya sebelum ada barang yang diretur (`cancel_return_request()`), transfer retur terbuka
  ikut batal. Transfer retur lama (M2-07) dipindah ke permintaan Selesai/Diproses/Batal oleh migrasi.
- Pemakaian & scrap (`/inventory/scrap`, kode `pu`, backlog R-12): jenis pemakaian
  (`transfers.usage_type`: pemakaian, scrap, lainnya; susut transit hanya dari lokasi transit lewat
  permintaan antar gudang) wajib dipilih dan bisa disaring di daftar. Trigger `transfers_usage_type`
  mengisi yang kosong (lanjutan mewarisi transfer asalnya, dari transit = susut transit) dan menolak
  jenis yang tidak cocok dengan lokasi asal. Penyesuaian manual memakai `adj_in`/`adj_out`.
- Scrap dan penyesuaian (arah tambah/kurangi stok): alasan wajib; admin gudang mengonfirmasi, lalu
  Manajer menekan "Setujui dan validasi" (`approveTransfer`, izin `inventory:approve`) sehingga
  pergerakan baru tercatat setelah disetujui. `validate_transfer` hanya menerima persetujuan dari
  user berperan Manajer atau Administrator; bila validasi gagal, persetujuan ikut batal.
  Manajer juga bisa menolak dengan alasan wajib (`reject_transfer()`, I-03): status Ditolak, pesanan
  stok dilepas, alasan tampil di detail dan log aktivitas. Transfer Ditolak hanya bisa dikembalikan
  ke Draft (diperbaiki lalu dikonfirmasi lagi) atau dibatalkan; persetujuan dan validasinya ditolak
  database. Daftar scrap/penyesuaian punya antrean `?antrean=persetujuan` dengan tombol Setujui dan
  Tolak per baris; penyesuaian hasil opname menampilkan sesi opnamenya (kolom Sumber, breadcrumb).
- Aturan tanggal (I-06, `transfer.py` hmx): tanggal rencana transfer Draft/Menunggu tidak boleh
  sebelum hari ini (WIB), saat disimpan (trigger `transfers_scheduled_date_guard`) maupun saat
  Konfirmasi (`transfer_scheduled_date_errors()`); transfer turunan (lanjutan, retur/pengganti, antar
  gudang, penyesuaian opname) dikecualikan. Tanggal efektif di masa depan tetap ditolak validasi.
  Semua alasan periode belum bisa ditutup dikumpulkan `period_close_errors()` (belum berakhir,
  periode sebelumnya belum ditutup, opname periode itu belum selesai) dan tampil di halaman Tutup
  periode. Halaman Stok bisa difilter per kategori produk (beserta sub-kategorinya) dan dicari
  lewat nomor lot.
- Tampilan lintas menu (I-08): daftar (`DataTable` dengan `listEmptyState`) di-scroll di dalam
  kotaknya dengan judul kolom dan kolom pengenal menempel; kolom opsional disembunyikan di layar
  kecil; halaman masuk dan verifikasi memakai `AuthLayout` (`src/app/login/auth-layout.tsx`) dengan
  panel brand navy berisi logo Veltics, ilustrasi SVG sebaris (alur pemasukan → penimbunan →
  pengeluaran, atau perisai untuk verifikasi), dan form berikon tanpa kartu di kanan; di HP panel
  brand menjadi strip ringkas. Password bisa ditampilkan/diisembunyikan, kode MFA diisi lewat
  `inputMode="numeric"`. Pengaturan memakai kartu form seperti halaman lain.
- Dashboard inventory (`/inventory/dashboard`, menu Ringkasan › Dashboard, izin `inventory:read`)
  meniru Inventory Dashboard hmx-002 (`core_inventory/data/inventory_dashboard_data.xml`, tampilan
  tile/kartu `webx_dashboard`): tile Qty on hand dan Qty tersedia (jumlah qty lintas produk dan
  satuan, seperti hmx), Stok habis dan Stok minus (jumlah baris saldo), Dokumen aktif (Menunggu,
  Sebagian tersedia, Siap), bar chart distribusi stok per gudang (10 teratas), dan 10 transfer
  aktif terbaru. Tile Expired Lot/Serial dan Near Expiry hmx belum ada karena lot belum punya
  tanggal kedaluwarsa. Query di `src/modules/inventory/server/queries/dashboard.ts`, hanya gudang
  yang boleh dilihat user.
- Data demo inventory (tombol Data demo di dashboard, Administrator; `createInventoryDemo`): mode
  pure backend seperti generator demo hmx tanpa AI. Pilih satu dari 10 studi kasus kawasan berikat
  (`src/modules/inventory/lib/demo-scenarios.ts`: garmen, sepatu, elektronik, furnitur, mainan,
  tas, bulu mata/wig, sarung tangan karet, wire harness, kemasan plastik), masing-masing dengan
  gudang `<awalan>-GBB`/`-GBJ`, produk berkode HS dari referensi kepabeanan, dan 7 partner. Mesin
  di `src/modules/inventory/server/demo-data.ts` menjalankan alur 45 hari yang sama: bahan impor
  dan lokal masuk, retur bahan cacat ke pemasok, pemakaian produksi, hasil produksi (penyesuaian
  masuk), kemasan antar gudang, ekspor, jual lokal, retur customer, reject di-scrap, penjualan sisa
  produksi, serta pekerjaan hari ini (kontainer Siap, order Draft, ekspor Sebagian tersedia, jual
  lokal Siap, bahan rusak menunggu persetujuan, kemasan di perjalanan). Semuanya lewat fungsi
  database yang sama dengan tombol aplikasi; riwayat divalidasi sebagai proses sistem supaya boleh
  bertanggal mundur, scrap/penyesuaian disetujui Administrator. Bisa ditekan berulang: master
  dibuat sekali, setiap klik menambah satu putaran dengan nomor dari
  `next_number('inventory_demo:<studi kasus>', 'all')` di nomor batch dan referensi. Ditolak bila
  tanggalnya masuk periode yang sudah ditutup; di server produksi hanya bila
  `DEMO_DATA_ENABLED=true`. `demoScenarioProblems()` memeriksa qty setiap studi kasus (dites).
- `npm run db:check` (`scripts/check-ledger.ts`, R-15) hanya membaca dan memeriksa: saldo
  `stock_balances` sama dengan ledger, qty dipesan sama dengan pergerakan transfer terbuka, dan
  transfer Selesai punya pergerakan Selesai berkode sama. Jalankan setelah migrasi data lama.
- Stock opname (`/inventory/opname`, backlog M2-09 dan R-13): Manajer membuat sesi Draft per gudang,
  opsional satu lokasi dan/atau satu kategori produk (beserta sub-lokasi/sub-kategorinya).
  `start_stock_count()` mengunci gudang, menolak bila gudang itu sudah punya opname yang berjalan,
  lalu mengisi daftar hitung dari saldo dengan qty sistem saat itu dan **membekukan gudang**: selama
  Berjalan, Selesai hitung, atau Menunggu persetujuan, `transfer_validation_errors()` menolak transfer
  yang menyentuh gudang itu (`stock_count_freeze_errors()`, menyebut nomor sesinya), kecuali
  penyesuaian dari sesi itu sendiri. Admin gudang menghitung di HP lewat scan SKU tanpa melihat qty
  sistem, lalu `complete_stock_count()` (Selesai hitung, bisa `reopen_stock_count()` = Hitung ulang)
  dan `submit_stock_count()` (ajukan). Manajer `approve_stock_count()` (selisih jadi penyesuaian
  bertanggal selesai hitung, `transfers.stock_count_id`, gudang dibuka) atau `reject_stock_count()`
  (kembali ke Selesai hitung). `cancel_stock_count()` membuka gudang. Status hanya berubah lewat
  fungsi-fungsi itu.
  Sejak I-04: lingkup bisa dibatasi ke produk tertentu (`stock_count_products`), produk tanpa stok
  (tanpa pelacakan) ikut sebagai baris qty sistem 0 (`include_zero_stock`), dan qty hitung awal bisa
  kosong, 0, atau sama dengan qty sistem (`initial_counted`); semuanya terkunci setelah Draft.
  Daftar hitung bisa diekspor (`/inventory/opname/<id>/export`, tanpa qty sistem) dan diimpor
  kembali (`/import`, dicocokkan lewat lokasi + product code + lot, kombinasi baru = barang temuan,
  semua atau tidak sama sekali dengan pesan per baris). Layar `/scan` untuk tablet: kode lokasi
  memilih lokasi, setiap pindaian product code (dan lot/nomor seri) menambah qty hitung 1 dan langsung
  tersimpan (`scanCountItem`). Detail transfer dan gudang menampilkan banner bila gudangnya sedang
  dibekukan opname.
- Tes e2e transaksi menyiapkan data master sendiri lewat `tests/e2e/inventory/fixtures.ts`. Isi pemilih
  berpencarian dengan `fillInteractive()` (`tests/shared/e2e/interactive.ts`), yang menunggu hidrasi React
  dulu; label dicari dengan `exact: true` supaya tidak cocok dengan placeholder lain.

## Dokumen BC

- Semua jenis dokumen (MVP: BC 2.3, 4.0, 2.5, 3.0, 4.1; lalu BC 2.0, 2.6.1, 2.6.2, 2.7, 1.6, 2.8,
  3.3, dan P3BET, backlog D-01–D-08) disimpan di satu set tabel yang dibedakan
  `doc_code` (backlog M3-01, `src/server/db/schema/customs.ts`): `customs_documents` (header),
  `customs_document_parties` (entitas, satu per kode entitas CEISA; pemilik barang BC 3.0, 3.3, dan
  P3BET berseri), `customs_document_lines` (barang, termasuk Voluntary Declaration BC 2.0),
  `customs_document_taxes` (pungutan per dokumen), `customs_guarantees` (jaminan BC 2.6.1/2.6.2),
  `customs_bank_accounts` (bank devisa), `customs_attachments` (lampiran dokumen, dan Dokumen
  Lartas per barang bila `line_id` terisi), `customs_packages`, `customs_containers`, dan
  `customs_transports`. Field yang hanya dipakai sebagian jenis
  (pelabuhan, TPS, data BC 1.1, DPP, uang muka, dst.) ada di kolom `details` (jsonb, selalu objek),
  jadi jenis baru tidak butuh tabel baru. Tampilannya terpisah per jenis dan sama persis dengan
  form hmx (tab, grup, field, label; backlog D-09): susunannya dibangkitkan dari view dan model hmx
  `core_it_inventory` oleh `scripts/import-customs-forms-from-hmx.py` ke
  `src/modules/it-inventory/lib/customs-layouts.generated.ts`. Jangan ubah file itu manual; ubah
  pemetaan field di script, jalankan ulang, lalu `npx prettier --write` file hasilnya. Label pesan
  aturan validasi harus sama dengan label field di form (dicek `tests/db/it-inventory/customs-specs.test.ts`).
- Kelengkapan field BC 2.0 mengikuti perbandingan Equip3 `ceisa.import.documents` (30/10/2026):
  NIB importir, negara importir/pemilik/pemusatan, PPJK dari partner, persetujuan pengiriman,
  flag Voluntary Declaration, bank devisa, dan enam rincian nominal pungutan. Tambahan ini
  berada di adaptor `completeBc20Layout()` pada `customs-specs.ts`, bukan file layout hasil
  generator. Semua tambahan opsional; tidak mengubah aturan wajib, perhitungan, atau alur CEISA.
  Nominal pungutan disimpan sebagai numeric(18,2) lewat migrasi `0102_bc20_tax_payments.sql`;
  jalankan `npm run db:migrate` sebelum menjalankan/deploy kode yang membaca kolom baru.
- List Pungutan BC 2.0 mengikuti tujuh kolom Equip3: Nilai Pungutan (teks), Dibayar,
  Ditanggung Pemerintah, Ditunda, Tidak Dipungut, Dibebaskan, Sudah Dilunasi. Jenis, Tarif,
  dan Status tetap disimpan untuk kompatibilitas tetapi tidak ditampilkan pada BC 2.0.
  Migrasi `0103_bc20_tax_value.sql` menambah teks Nilai Pungutan dan mengizinkan jenis kosong;
  jenis tetap diwajibkan server pada dokumen selain BC 2.0. Daftar isian BC tidak membuat
  penjumlahan Total otomatis di footer.
- `doc_code` sama dengan kodeDokumen CEISA (`23`, `40`, `25`, `30`, `41`, `20`, `261`, `262`,
  `27`, `16`, `28`, `33`, dan `331` untuk P3BET); label, arah, dan status ada di
  `src/modules/it-inventory/lib/customs.ts`. Arah di database: `customs_doc_direction()`; nama
  jenis untuk pesan: `customs_doc_title()`. Semua jenis memakai alur dan
  pilihan transfer yang sama (H-01).
- Menambah nilai `customs_doc_code`: drizzle menjalankan semua migrasi dalam satu transaksi, dan
  nilai dari `ALTER TYPE ... ADD VALUE` tidak bisa dipakai di transaksi itu. Bila aturan validasi
  jenis baru ikut di-seed, buat ulang tipenya seperti migrasi `customs_doc_codes_all`.
- Nomor dokumen (H-01, sequence `IT/23/` hmx): trigger mengisi `number` = `IT/<kode>/<5 digit>`
  urut per jenis (`next_number('customs_document:<kode>', 'all')`) saat dokumen dibuat; nomor dan
  jenis tidak bisa diubah. No. Aju, tanggal aju, No. Daftar, dan tanggal daftar diisi manual dari
  portal CEISA di header form (boleh kosong selama Draft). No. Aju harus 26 angka/huruf besar
  (constraint `customs_documents_aju_number_format`; form mengubah ke huruf besar dan membuang
  spasi).
- Header form di atas tab sama dengan grup sheet form hmx (H-03, `CustomsLayout.top`): IT Inventory
  document sequence (baca), Inventory Transfer Documents (chip transfer + pemilih), No. Aju (BC 3.3
  juga Tgl. Aju), No. Daftar, Tgl. Daftar, dan Perusahaan (baca, dari profil; Cabang hmx tidak
  dipakai karena satu perusahaan). Isian `meta` tidak diketik: nomor dari dokumen, perusahaan dari
  profil, transfer dari pemilih.
- Dokumen baru selalu Draft dan pembuatnya diisi dari `app.user_id`.
- Field wajib per jenis dokumen ada di tabel `doc_validation_rules` (M3-03): `target` header
  (kolom `customs_documents`), details (kunci jsonb, camelCase), party (kode entitas CEISA),
  line (kolom baris, diperiksa per seri), attachment (kode jenis dokumen, mis. 380 invoice),
  transport/package/container (minimal satu baris yang kolomnya terisi). Field tabel dicek ke
  `information_schema` saat aturan disimpan. `customs_document_errors(dokumen)` mengembalikan semua
  kekurangan sekaligus (kosong = lengkap). Seed awal di migrasi `doc_validation_rules_seed` (jenis
  di luar MVP: `customs_doc_codes_all`); data uji
  dokumen lengkap per jenis ada di `tests/db/it-inventory/customs-fixtures.ts`.
- Baris barang hanya untuk produk aktif yang siap dokumen BC (punya kode HS). Kategori IT Inventory
  selalu disalin dari produk; product code, kode HS, dan uraian diisi dari produk bila kosong.
  `qty` dalam satuan CEISA, `stock_qty` dalam satuan stok produk; keduanya terisi dari transfer
  yang dipilih (H-04) dan bisa diubah.
- Entitas disalin dari profil perusahaan atau partner, jadi dokumen tidak ikut berubah saat master
  berubah.
- Form dokumen BC (M3-04) dirakit dari bagian bersama di
  `src/modules/it-inventory/components/customs/`: tab Header, Entitas, Dokumen, Pengangkut,
  Kemasan dan peti kemas, Barang, Pungutan, Transaksi, Pernyataan. Isi setiap tab diatur
  `CustomsFormSpec` jenisnya (`src/modules/it-inventory/lib/customs-form.ts`): isian header atau
  `details`, peran entitas (dari profil perusahaan atau partner), isian barang, pungutan bawaan.
  Halaman daftar/buat/detail sama untuk semua jenis (`customs-document-pages.tsx`); halaman di
  `src/app/(app)/dokumen-bc/<jenis>/` hanya meneruskan spec-nya.
- Spec per jenis ada di `src/modules/it-inventory/lib/customs-specs.ts` (M3-05–M3-09), menu
  Kepabeanan › BC 2.3, BC 4.0, BC 2.5, BC 3.0, BC 4.1 (`/dokumen-bc/bc23`, dst.). Field mengikuti
  `models/document_XX.py` hmx. `tests/db/it-inventory/customs-specs.test.ts` memastikan setiap field yang
  diwajibkan `doc_validation_rules` bisa diisi di form jenisnya.
- Seluruh isi form dikirim sebagai satu JSON (`document`) ke `saveCustomsDocument`: header
  diperbarui lalu semua bagian diganti dalam satu transaksi; hanya Draft yang bisa diubah. Draft
  boleh belum lengkap; kelengkapan diperiksa `customs_document_errors()`. Transfer yang dipilih
  ikut JSON (`transfers`, hanya id yang disimpan): tautan yang dilepas dihapus, yang baru ditambah.
  Dokumen baru: entitas
  perusahaan (pengusaha, pemilik, atau eksportir) dari profil perusahaan, kantor pabean pengawas,
  dan penandatangan = user yang login. Entitas partner disalin dari `/api/customs-parties`, produk
  dicari lewat `/api/customs-products` (hanya yang punya kode HS).
- Lampiran (M3-10): file diunggah per baris di tab Dokumen lewat `uploadCustomsAttachment` (hanya
  dokumen Draft yang sudah tersimpan; PDF, JPG, PNG, Excel, Word, maksimal 5 MB) ke kunci
  `customs/<id dokumen>/<uuid>.<ext>`, lalu kunci dan nama filenya tersimpan bersama baris saat
  Simpan (kunci milik dokumen lain ditolak). Unduh lewat `/api/customs-files?key=...` (izin
  `bc:read`, hanya kunci yang tercatat sebagai lampiran). File yang dilepas atau tidak jadi
  disimpan tetap ada di storage; belum ada pembersihan otomatis.

- Alur status mengikuti hmx (H-01, migrasi `customs_hmx_flow_rules`): Draft → Submitted lewat
  `submit_customs_document()`, yang memeriksa `customs_document_errors()` dan wajib ada Inventory
  Transfer Documents; semua kekurangan dilaporkan sekaligus. Status hanya berubah lewat fungsi itu
  (penanda transaksi `app.customs_status_write`, pesan "Gunakan tombol Submit untuk mengubah status
  dokumen."). Dokumen Submitted beserta semua bagian dan tautan transfernya dikunci trigger
  (`customs_parts_guard`) dan tidak bisa dihapus; detailnya tanpa tombol Edit dan Submit. Draft
  boleh dihapus (pilih baris di daftar, Hapus).
  Tidak ada status Siap ajukan, Terdaftar, Ditolak, Batal, maupun revisi bernomor versi.
- Daftar dokumen terpadu (`/dokumen-bc`) menampilkan seluruh jenis BC dengan kolom Jenis dokumen,
  Nomor, No. Aju, No. Daftar, Tgl. Daftar, Kantor Pabean
  Pengawasan, Status. Cari nomor, nomor aju, nomor daftar, atau nama partner; filter status, tanggal
  dibuat (bulan ini, bulan lalu, 3 bulan terakhir, tahun ini; WIB), jenis dokumen, dan kantor
  pabean (pilihannya dari kantor yang dipakai dokumen). Unduh PDF/Excel rekap daftar di kanan
  judul daftar; Hapus dan Duplikat lewat pilih baris. Menu hanya menampilkan Daftar dokumen;
  daftar per jenis tetap bisa dibuka lewat tautan lama. Buat membuka dialog Entitas → Jenis
  dokumen (pilihan jenis dibatasi menurut entitas); setelah Lanjut, form per jenis tetap dipakai.
  Entitas pada dialog hanya untuk memilih jenis, bukan data baru yang disimpan di dokumen.
- Duplikat: `duplicate_customs_document()` membuat Draft baru (nomor baru, tanpa No. Aju, nomor
  daftar, dan tautan transfer) dengan salinan header, entitas, barang beserta pungutan, kemasan,
  peti kemas, pengangkutan, dan baris lampiran tanpa file.
- Export draft untuk input manual ke CEISA: `/api/customs-documents/<id>/export?format=pdf|xlsx`
  (izin `bc:read`), dibangun `customsExportSections()` di
  `src/modules/it-inventory/server/customs-export.ts`: Excel satu sheet per bagian (`exceljs`),
  PDF A4 (`pdf-lib`, font standar Latin-1; karakter lain diganti "?"). Bagian Dokumen berisi header
  form (nomor urut, transfer yang dipilih, No. Aju, No. Daftar, Tgl. Daftar, Perusahaan) dan status.
- Tes yang perlu menghapus dokumen Submitted memakai `purgeCustomsDocuments()` atau
  `forceCustomsStatus()`; `submitDocument()` memilih transfer sumber lalu Submit
  (`tests/db/it-inventory/customs-fixtures.ts`).

## Dokumen BC ↔ transfer (H-01, mengikuti hmx)

- Dokumen memilih transfer (Inventory Transfer Documents) lewat tabel `customs_document_transfers`
  (dokumen, transfer). Satu dokumen boleh memilih beberapa transfer, dan satu transfer boleh dipilih
  beberapa dokumen. Transfer yang sudah dipilih tidak bisa dihapus.
- Sumber yang diizinkan per jenis mengikuti `DOCUMENT_SOURCE_MAP` hmx
  (`customs_document_source_codes()`, `CUSTOMS_DOCUMENT_SOURCE_CODES`): BC 1.6/2.0/2.6.2 `gr`;
  BC 2.3 dan 4.0 `itw_in`, `itw_out`, `gr`; BC 2.5/2.6.1/2.8/3.0/P3BET `gi`; BC 2.7 `itw_in`,
  `itw_out`, `gr`, `gi`; BC 3.3 `gr`, `gi`; BC 4.1 `itw_in`, `itw_out`, `gi`. Transfer harus Siap atau
  Selesai; selain itu trigger `customs_document_transfers_check` menolak dengan pesan hmx
  "Dokumen … hanya dapat dikaitkan dengan sumber inventory yang diizinkan."
- Tidak ada gerbang: validasi transfer tidak menunggu dokumen BC, dan tidak ada alokasi dokumen
  asal. Data lama dipindahkan migrasi `customs_hmx_flow` (Terdaftar → Submitted, Siap
  ajukan/Ditolak → Draft, Batal dihapus, tautan transfer lama → `customs_document_transfers`).
- Pemilih transfer (H-04, `hx-it-inventory-transfer-selector` hmx): tombol Pilih transfer di
  header form membuka panel samping (`transfer-selector.tsx`) dengan jenis sumber di kiri
  (Pengiriman, Penerimaan, Transfer antar gudang; hanya yang diizinkan jenis dokumennya) dan
  transfer Siap/Selesai yang bisa dicentang lintas halaman (`/api/customs-documents/transfers`).
  Juga bisa sebelum dokumen pertama kali disimpan. Setelah Terapkan, barang disinkronkan per produk
  dari permintaan semua transfer terpilih (`/api/customs-documents/transfer-products`,
  `syncTransferLines()` seperti `sync_inventory_transfer_product_lines` hmx): produk yang sudah ada
  diperbarui jumlahnya, produk baru ditambah, barang produk lain dibiarkan, jadi memilih transfer
  yang sama lagi tidak membuat baris ganda. Melepas chip transfer tidak mengubah barang.
- Layar: panel Dokumen BC di detail penerimaan/pengiriman dan kaki antar gudang
  (`/inventory/transfer/[id]` dengan kode `itw_out`/`itw_in`, H-02; pindah lokasi biasa tanpa
  panel) hanya membaca dokumen yang memilih transfer itu (disisipkan halaman `src/app` lewat prop
  `panel` `TransferDetailPage`, jadi modul inventory tidak mengimpor modul IT Inventory). Mode baca
  detail dokumen punya bagian Transfer (status dan tanggal selesai tiap transfer).
- Rantai Dokumen (`/dokumen-bc/flow`) tidak ditampilkan lagi; URL lama mengarah ke
  `/dokumen-bc`. Seri Barang Asal (`source_sequence` hmx) tetap isian manual di form Barang
  (`details.sourceSequence`).
- Data demo (M4-07, H-07): `SEED_DEMO_DATA=true npm run db:seed` (butuh profil perusahaan) membuat
  produk `DEMO-KAIN`, penerimaan Selesai, BC 2.3 Submitted yang memilih penerimaan itu, pengiriman
  Siap `SO-DEMO-001` (memesan 500 dari stok), dan BC 2.5 Draft. Alur demo: buka BC 2.5, Edit, Pilih transfer
  `SO-DEMO-001`, Simpan, lalu Submit.

## Penyimpanan file

- Semua file lewat `getStorage()` (`src/server/storage`): `put`, `get`, `delete`. Driver dipilih
  `STORAGE_DRIVER`: `local` (bawaan, folder `STORAGE_DIR`, default `.storage/`, diabaikan git) atau
  `s3` (object storage S3-compatible, path-style, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Driver S3 memakai `fetch` dengan tanda tangan SigV4
  sendiri (tanpa SDK); tesnya memakai contoh resmi AWS.
- Kunci file hanya huruf, angka, `-`, `_`, `.`, `/`, tanpa `..` (`assertSafeKey`).

## Arsip dan hapus

- Data master yang sudah dipakai tidak dihapus, tapi diarsipkan (kolom `active`, centang Aktif di
  form). Data arsip tetap tampil di daftar (diredupkan) dan bisa disaring lewat filter Status
  (`?status=aktif` / `?status=arsip`, `pickActive()` di `src/lib/list-params.ts`).
- Data arsip tidak bisa dipilih untuk data baru. Pilihan di form hanya berisi data aktif, dan server
  memeriksanya lagi (gudang dan induk lokasi, kategori satuan, satuan stok, kode referensi, juga
  saat import). Nilai arsip yang sudah tersimpan sebelumnya tetap boleh disimpan ulang.
- Produk, kategori produk, partner, satuan (kecuali satuan acuan), gudang, dan lokasi di dalam gudang bisa dihapus
  dari halaman detailnya bila belum dipakai, misalnya salah input. Yang menolak adalah database:
  `deleteUnlessUsed()` (`src/server/db/delete-record.ts`) menghapus, lalu menerjemahkan penolakan
  foreign key jadi pesan "masih dipakai di data ..., arsipkan saja". Referensi kepabeanan, profil
  perusahaan, dan lokasi virtual tidak bisa dihapus.

## Import dan export master data

- Produk, partner, dan lokasi bisa di-export (Excel atau CSV, semua peran dengan `master:read`) dan
  di-import (`master:write`) dari tombol di header halaman daftarnya. Lokasi untuk semua gudang ada
  dalam satu file di halaman Gudang & lokasi.
- Baris dicocokkan lewat kode/product code (partner: NPWP, dan NITKU bila beberapa partner memakai
  NPWP yang sama): kode baru menjadi data baru, kode yang sudah ada diperbarui. Kolom
  yang tidak ada di file tidak mengubah data tersimpan, jadi file boleh hanya berisi kode dan kolom
  yang ingin diubah (mis. SKU + Kode HS). Baris yang isinya sama dilewati supaya audit log tidak penuh.
- Semua baris divalidasi dulu dengan schema dan pemeriksaan yang sama dengan form. Bila ada satu
  saja yang salah, tidak ada yang disimpan dan hasilnya berisi semua kesalahan per nomor baris.
- File export adalah template import: judul kolom sama, semua sel ditulis sebagai teks (kode HS dan
  NPWP tidak kehilangan angka 0 di depan). CSV boleh memakai koma atau titik koma. Batas 5 MB dan
  20.000 baris per file (`src/server/spreadsheet.ts`); `serverActions.bodySizeLimit` di
  `next.config.ts` harus sedikit di atas batas itu.
- Kode: kolom dan aturan per master di `src/modules/inventory/server/master-io/` (`partners.ts`,
  `locations.ts`) dan `src/modules/it-inventory/server/master-io/products.ts` (produk memuat kolom
  kepabeanan); bagian bersama di `src/server/master-io/`, baca/tulis file di
  `src/server/spreadsheet.ts`, UI di `src/components/import/`.
  `defineFormAction` meneruskan file dari form ke schema (`importFileSchema`).
- Import 5.000 produk baru sekitar 1,5 detik, 5.000 perubahan sekitar 2,5 detik (tes
  `tests/db/inventory/master-import.test.ts`).

## Testing

```bash
npm test                    # unit test + tes database, menyalakan Postgres lebih dulu
npm run test:e2e            # build production di port 3100, lalu tes di Chromium
npx playwright install chromium   # sekali saja sebelum test:e2e pertama
```

- **Unit** (`src/**/*.test.ts`, di sebelah file yang dites): logika murni tanpa database.
- **Database** (`tests/db/`): fungsi dan trigger SQL serta kode server yang menulis data, dijalankan
  terhadap Postgres sungguhan. Tes SQL membungkus perubahannya dengan `inRollback()` supaya tidak
  meninggalkan data.
- **End-to-end** (`tests/e2e/`): alur di browser. Akun tes dibuat oleh `tests/shared/e2e/global-setup.ts`
  lewat script seed. `tests/shared/e2e/admin.setup.ts` login sebagai Administrator lalu mengaktifkan MFA
  secara sukarela (opsional untuk semua peran; kode TOTP dihitung oleh `tests/shared/e2e/totp.ts`) supaya
  alur verifikasi TOTP ikut teruji, lalu menyimpan sesinya; tes yang butuh Administrator memakai
  `test.use({ storageState: ADMIN_STATE_FILE })`.

Tes database dan E2E dipisah menurut modul pemiliknya; pengujian UI/infrastruktur lintas modul
berada di `base`. Fixture khusus modul tetap bersama tes modul tersebut, sedangkan setup dan
helper lintas modul berada di `shared`. Unit test tetap di sebelah source masing-masing.

```text
tests/
├── db/
│   ├── base/
│   ├── inventory/
│   └── it-inventory/
├── e2e/
│   ├── base/
│   ├── inventory/
│   └── it-inventory/
└── shared/
    ├── db/
    ├── e2e/
    ├── test-database.ts
    └── test-env.ts
```

Contoh menjalankan tes per modul (ganti nama folder untuk modul lain):

```bash
npm test -- --project db tests/db/inventory/
npm test -- --project unit src/modules/inventory/
npm run test:e2e -- tests/e2e/inventory/
npx playwright test --list   # hanya discovery, tanpa menjalankan browser
```

Tes database dan E2E memakai database terpisah `it_inventory_test` di container yang sama, yang dikosongkan lalu
dimigrasi ulang setiap kali tes jalan. Database development tidak tersentuh. Ganti lewat env
`TEST_DATABASE_URL` bila perlu; namanya wajib berakhiran `_test`.

CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, format, `npm test`, dan `npm run test:e2e`
di setiap push dan pull request.

## Modul

Satu app dan satu database, dibagi tiga modul (backlog S-01, persiapan memisah app):

| Modul        | Isi                                                                                                                                             | Lokasi kode                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Base         | Login, MFA, peran, audit log, pengguna, pengaturan, komponen UI bersama, infrastruktur server action dan database, referensi kode (`ref_codes`) | `src/components`, `src/lib`, `src/hooks`, `src/server`                                         |
| Inventory    | Gudang, lokasi, produk, kategori, satuan, partner, transfer, stok, opname, periode                                                              | `src/modules/inventory` (`components`, `lib`, `actions`, `server/queries`, `server/master-io`) |
| IT Inventory | Data kepabeanan produk (kategori IT Inventory, kode HS, siap BC), profil perusahaan, referensi kepabeanan, dokumen BC, laporan                  | `src/modules/it-inventory`                                                                     |

Aturan (dipaksakan ESLint `architecture/module-boundaries` di `eslint.config.mjs`, `npm run lint`):

- Base tidak boleh mengimpor modul mana pun atau `src/app`.
- Inventory tidak boleh mengimpor IT Inventory atau `src/app`, seperti `core_inventory` hmx yang
  tidak mengenal `core_it_inventory`.
- IT Inventory boleh mengimpor inventory dan base, tapi tidak `src/app`.
- `src/app` (halaman dan route handler) merakit modul: mis. form produk memakai field inventory
  dan field kepabeanan (`it-inventory/components/product-customs-fields.tsx`), aksi produk
  menggabungkan `productFields` dengan `productCustomsFields`.
- Skema Drizzle (`src/server/db/schema`) adalah lapisan data bersama karena databasenya satu;
  boleh membaca konstanta enum dari `lib` modul, bukan action atau kode server modul.
  Kolom kepabeanan tetap di tabel yang sama (seperti
  `inherit` di hmx), tapi field form dan aturannya milik IT Inventory. Kode inventory boleh membaca
  kolom tabel bersama (mis. filter daftar produk), selama tidak mengimpor kode IT Inventory.
- Menu per modul (S-02, seperti active-section webx hmx): pemilih modul di atas sidebar
  (Inventory, IT Inventory, Pengaturan), sidebar hanya menampilkan area kerja modul aktif. Modul
  aktif mengikuti halaman yang dibuka (`moduleForPath`); pemilih hanya menampilkan modul yang punya
  menu untuk peran user (`modulesFor`); pencarian menu mencari ke semua modul. Area kerja punya
  modul pemilik (`NavGroup.module` di `src/lib/navigation.ts`), izin juga (`PERMISSION_MODULES` di
  `src/lib/permissions.ts`).
- Fitur baru: taruh di modul pemiliknya (komponen, lib, aksi server, query), halaman di `src/app`
  hanya merakit. Kalau inventory butuh sesuatu dari IT Inventory, balik arahnya: IT Inventory yang
  memasang bagiannya lewat `src/app`.

### Konvensi penempatan kode

- `src/app` berisi route, layout, UI khusus route, dan penggabungan modul. Action yang hanya
  melayani satu domain berada di `src/modules/<modul>/actions`. Action produk tetap di route
  karena menggabungkan field Inventory dan IT Inventory; helper domainnya berada di modul pemilik.
- `components`, `lib`, dan `hooks` di root `src` adalah kode bersama. Komponen yang memahami
  transfer, stok, atau dokumen BC berada di modulnya. React hook bersama berada di `src/hooks`.
- `lib` berisi schema, tipe, konstanta, dan logika murni yang aman untuk client/server. Kode yang
  membaca database, storage, atau rahasia berada di `server` dan memakai `import "server-only"`.
  Entry point Server Action memakai `"use server"` dan boleh diimpor komponen client.
  Koneksi CLI (`server/db/client.ts`), schema, dan helper murni yang dipakai seed/script tidak
  diberi penanda ini agar tetap bisa dijalankan di luar Next.js.
- Infrastruktur action, pengaturan, dan referensi kode bersama berada di `src/server/actions`.
  Akses gudang pengguna milik Inventory walaupun ditampilkan di halaman administrasi.
- Import lintas lapisan memakai alias `@/`; import relatif digunakan di dalam lapisan/modul yang
  sama. ESLint menjaga batas modul pada import, re-export, dan dynamic import literal.
- Unit test tetap dekat kode (`*.test.ts`); tes integrasi database dan E2E berada di `tests`.
- Lokal dan CI memakai Node 24 LTS. Gunakan `npm ci` untuk instalasi persis dari lockfile;
  gunakan `npm install` ketika sengaja mengubah dependency.

## Struktur folder

```
drizzle/                 migrasi SQL (hasil generate + file SQL kustom)
src/
  app/                   route Next.js (halaman, layout, route handler); merakit modul
  app/(app)/             halaman setelah login (layout dengan sidebar)
  modules/
    inventory/           modul inventory: components, lib, actions, server/queries, server/master-io
    it-inventory/        modul IT Inventory: components, lib, server
  components/ui/         komponen shadcn/ui
  components/data-table/ tabel daftar dengan cari, filter, pagination di server
  components/            komponen bersama (sidebar, header halaman, placeholder modul)
  hooks/                 React hooks untuk client
  lib/                   utilitas yang aman dipakai di client maupun server
  server/                kode khusus server, tidak boleh diimpor dari client
    queries/             query baca bersama (aktivitas, pengguna, referensi kode)
    db/
      seed-data/         CSV data awal (referensi kepabeanan)
      schema/            schema Drizzle per kelompok tabel
      client.ts          pembuat koneksi (dipakai app dan script CLI)
      index.ts           koneksi untuk aplikasi (server-only)
      seed.ts            data awal
scripts/                 script satu kali (mis. impor referensi dari Odoo)
tests/
  db/                    tes fungsi/trigger SQL dan kode server (Vitest + Postgres)
  e2e/                   tes browser (Playwright)
```

## Aturan migrasi

- Perubahan tabel: ubah schema di `src/server/db/schema`, lalu `npm run db:generate -- --name=<nama>`.
- Fungsi, trigger, dan view: `npm run db:custom -- <nama>`, tulis SQL-nya, pisahkan statement dengan
  `--> statement-breakpoint`.
- Foreign key ke tabel master selalu `ON DELETE RESTRICT`, supaya data master yang sudah dipakai
  tidak bisa dihapus. Daftarkan nama tabel baru yang merujuk master di `REFERENCING_TABLES`
  (`src/server/db/delete-record.ts`) supaya pesan penolakannya jelas.
- Jangan pernah mengubah database secara manual. Setiap tabel yang punya `updated_at` diberi trigger
  `set_updated_at()`.
- `drizzle-kit migrate` menjalankan semua migrasi yang belum jalan dalam satu transaksi. Nilai enum
  baru (`ALTER TYPE ... ADD VALUE`) tidak boleh dipakai di transaksi yang sama: jangan pakai di
  statement migrasi atau di fungsi `LANGUAGE sql`; di fungsi plpgsql aman, atau bandingkan sebagai
  teks (`status::text`).
- Mengisi kolom baru di data lama yang terkunci trigger (transfer/baris Selesai): matikan trigger
  user sementara di migrasi itu (`ALTER TABLE ... DISABLE TRIGGER USER`, lalu `ENABLE`).
