---
name: ui-it-inventory
description: Aturan desain UI khusus aplikasi IT Inventory Kawasan Berikat (Next.js + shadcn base-ui). Pakai setiap kali membuat, mengubah, me-review, atau me-redesign halaman, form, tabel, layout, atau komponen di repo ini, termasuk saat UI terasa generik ("AI slop"). Lengkapi skill anti-ui-slop dengan konteks produk, pengguna, aturan PRD, dan pemeriksaan akhir untuk repo ini.
---

# UI IT Inventory

Aplikasi ini alat kerja harian untuk gudang berikat, bukan landing page. Desain yang baik di sini
terasa seperti instrumen: padat, tenang, cepat dipindai, dan setiap warna atau ikon punya arti.
Pakai bersama skill `anti-ui-slop`; skill ini memberi konteks dan aturan yang spesifik. Aturan
domain (dokumen BC, CEISA, laporan, rujukan sistem lama) ada di skill `it-inventory-domain`.

## Siapa yang memakai dan untuk apa

| Peran            | Kerja utama di layar                                                          | Konsekuensi desain                                                           |
| ---------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Admin gudang     | Penerimaan, pengiriman, stock opname, sering di tablet/HP sambil scan barcode | Target sentuh besar, input scan selalu fokus, satu tangan, sedikit ketikan   |
| Staf exim / PPJK | Mengisi dokumen BC yang panjang, mencari kode HS, kantor, pelabuhan           | Form padat dan terkelompok, keyboard-first, pilihan `[kode] nama` cepat      |
| Manajer          | Menyetujui adjustment/opname, memantau selisih                                | Yang butuh keputusan harus menonjol; sisanya tenang                          |
| Auditor          | Membaca laporan dan menelusuri transaksi, hanya baca                          | Tampilan baca yang rapi (bukan form yang di-disable), angka mudah dicocokkan |
| Administrator    | Master data, user, konfigurasi                                                | Tabel padat, import/export Excel (M1-07)                                     |

Konsep domain yang harus terlihat jelas di UI (semua gudang berikat sejak RM-02, jadi tidak ada
penanda berikat per gudang): **status dokumen
BC** (Draft → Submitted, seperti hmx), **siap/belum siap dokumen BC**,
**selisih** (opname, qty dokumen vs transfer), **arsip**, dan **periode tertutup**.

## Pola yang sudah ditetapkan (redesign putaran 1)

Pakai komponen ini; jangan kembali ke pola lama yang terasa slop.
Untuk posisi tombol dan layout, baca `docs/view-standards.md` sebagai rujukan utama.

| Kebutuhan                                    | Pakai                                                                                                                                                                                                                                                                                                                                                                        | Hindari                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Status / pengecualian                        | `StatusBadge` (`src/components/status-badge.tsx`) dengan tone semantik                                                                                                                                                                                                                                                                                                       | `Badge` shadcn berwarna abu-abu, pill "Aktif" di setiap baris                                                                      |
| Nama di tabel + arsip                        | `NameCell archived={!row.active}` dan `rowMuted` di `DataTable`                                                                                                                                                                                                                                                                                                              | Kolom "Status" berisi Aktif/Arsip                                                                                                  |
| Buka detail dari daftar                      | `DataTable rowHref` (seluruh baris jadi tautan)                                                                                                                                                                                                                                                                                                                              | Kolom "Aksi" berisi link "Ubah"                                                                                                    |
| Daftar kosong                                | `listEmptyState()` (`src/components/data-table/empty-state.tsx`): seperti list view hmx, tabel tetap setinggi 5 baris (baris pengisi) tanpa pesan atau tombol di tengah; pesan hanya untuk pembaca layar, aksi Buat di toolbar, filter dihapus lewat chip                                                                                                                    | Pesan + tombol Buat/Hapus filter di tengah tabel daftar                                                                            |
| Angka di tabel                               | kolom `align: "right"`; tabel sudah `tabular-nums`                                                                                                                                                                                                                                                                                                                           | Angka rata kiri                                                                                                                    |
| Ringkasan error form                         | `FormErrors` tepat setelah `<form>` (fokus otomatis)                                                                                                                                                                                                                                                                                                                         | Ringkasan di bawah dekat tombol Simpan                                                                                             |
| Nilai yang tidak bisa diubah                 | `StaticField`                                                                                                                                                                                                                                                                                                                                                                | `Input disabled` abu-abu                                                                                                           |
| Kelompok field                               | `FormSection` (kartu: judul + garis, isi grid 12 kolom; tanpa bingkai di dalam `Tabs`)                                                                                                                                                                                                                                                                                       | `fieldset` polos tanpa judul, grid buatan sendiri                                                                                  |
| Kembali ke daftar                            | breadcrumb di header (`AppBreadcrumb`): Area › Modul › halaman dari `PageHeader` (`crumbs` = dokumen induk + nomor)                                                                                                                                                                                                                                                          | Tombol "Kembali ke daftar" di setiap detail                                                                                        |
| Tombol alur dokumen                          | `RecordModes.actions` setelah Edit/Buat; tanpa mode edit gunakan `DocumentLayout.actions`. Hasil lewat `usePageMessage().show(result)`. Aksi alur tetap ada saat record tidak editable sesuai izin/status, tetapi tersembunyi selama edit                                                                                                                                    | Memasang aksi di `DocumentLayout.actions` sekaligus `RecordModes`, atau memproses data tersimpan ketika draft lokal belum disimpan |
| Info detail dokumen/master                   | `InfoGrid` (label di atas nilai, 3 kolom; `wide` untuk catatan/alasan) lalu `Section` per bagian                                                                                                                                                                                                                                                                             | `dl` dua kolom memanjang, `h2` + `space-y` buatan sendiri                                                                          |
| Form (UF-04)                                 | `FORM_CLASS` → `FormActions` di **atas** → `FormErrors` → `FormSection`; lebar field lewat `span` (3/4/6/8/9/12, bawaan 6) di `FormField`/`StaticField`; `FormColumns`/`FormColumn` (kiri siapa/di mana, kanan kapan/rujukan). Ukuran di `globals.css` (`.form-sheet`, `.form-grid`, `.form-field`, `.form-notebook`)                                                        | `max-w-*`/`grid-cols-[…]`/`w-48` per form, tombol Simpan di bawah                                                                  |
| Daftar ala hmx (RU-22)                       | `ListToolbar action/pager` + `ListSearchBar` (chip filter, panel Filter/Kelompokkan/Favorit) + `ListPager`; `DataTable id` + kolom `optional`, `group`                                                                                                                                                                                                                       | Select filter terpisah, pagination di bawah tabel                                                                                  |
| Dokumen ala hmx (RU-23)                      | `DocumentLayout` dengan satu baris aksi aktif; `StatusSteps` deretan tahap di kanan tombol, membungkus di HP tanpa dropdown. Panel `ActivityLog` tertutup saat membuka record; desktop melebar 320px saat dibuka, HP lewat panel dialog                                                                                                                                      | Dua baris aksi baca/edit, kolom status tetap di samping, atau status dropdown                                                      |
| Dokumen BC per jenis (M3)                    | `CustomsFormSpec` di `src/modules/it-inventory/lib/customs-specs.ts` + halaman `customs-document-pages.tsx`; form `CustomsDocumentForm` dengan tab hmx (Header, Entitas, Dokumen, Pengangkut, Kemasan, Barang, Pungutan, Transaksi, Pernyataan), baris berulang sebagai kartu `RowCard`; tes `customs-specs.test.ts` memastikan field wajib ada di form                      | Satu form generik yang menyembunyikan field per jenis, form BC disalin per jenis                                                   |
| Bagian dari modul lain di halaman modul (M4) | Prop slot, mis. `TransferDetailPage panel={(t) => <TransferCustomsPanel transferId={t.id} />}` diisi halaman `src/app`; Beranda menggabungkan `attentionItems` dan `customsAttentionItems` di `src/app/(app)/page.tsx`                                                                                                                                                       | Modul inventory mengimpor komponen/query modul IT Inventory                                                                        |
| Toolbar daftar                               | `ListToolbar` (Buat di kiri, cari/filter di tengah, pager di kanan; bertumpuk di HP)                                                                                                                                                                                                                                                                                         | Susunan flex buatan sendiri per halaman                                                                                            |
| Tombol (keputusan user 22/10/2026)           | Selalu komponen `Button`: setiap tombol punya kotak (border atau isi warna) dan hover. Utama `default`, sekunder `outline`/`ghost` (keduanya berkotak, `ghost` untuk ikon/aksi baris), berbahaya `destructive`. `inline` (tanpa kotak, tetap hover) hanya untuk tombol yang menempel di dalam kontrol lain: panah/hapus isi di input pilihan, hapus chip, buka-tutup sidebar | `<button>` polos untuk aksi, tombol teks bergaya tautan (varian `link` dihapus), ikon tanpa kotak di form/tabel                    |
| Ukuran                                       | Token `text-control` (15px: input, tombol, menu, isi) dan `text-caption` (13px: judul kolom, petunjuk); kontrol 36px                                                                                                                                                                                                                                                         | `text-xs`, `h-8`, ukuran khusus per halaman                                                                                        |
| Beranda                                      | daftar "Perlu perhatian" dari data nyata (`src/modules/inventory/server/queries/home.ts`)                                                                                                                                                                                                                                                                                    | Kartu sapaan, angka karangan, duplikasi menu                                                                                       |
| Import/export master data                    | `ImportExportActions` di `actions` `PageHeader`; halaman import pakai `ImportForm` + `ImportColumnGuide`                                                                                                                                                                                                                                                                     | Tombol Export/Import di toolbar tabel (toolbar jadi terlalu penuh)                                                                 |
| Hapus data master                            | `DataTable bulkDelete` di halaman daftar: centang baris → baris aksi "N dipilih · Hapus · Batal pilih" di atas tabel, konfirmasi `AlertDialog`, pesan tolak per data ke slot pesan halaman; filter `Status` di daftar                                                                                                                                                        | Tombol Hapus di form/halaman detail, hapus tanpa konfirmasi                                                                        |
| Detail data master                           | `RecordModes` (view + form): dibuka dalam mode baca (`ViewSection` + `StaticField` dengan `span` sama seperti form) dengan tombol Edit dan Buat; Edit → form dengan Simpan dan Buang; form memanggil `useSaveFeedback(state)`                                                                                                                                                | Form langsung terbuka di halaman detail, tampilan baca yang beda tata letaknya                                                     |
| Ikon menu                                    | Hanya untuk menu induk (area kerja) di `NAVIGATION`, masing-masing berbeda; menu anak tanpa ikon dan menjorok                                                                                                                                                                                                                                                                | Ikon di setiap menu anak                                                                                                           |
| Logo                                         | `public/brand/veltinc-logo.png` (logo penuh) di header sidebar dan `public/brand/veltinc-mark.png` (mark V tanpa wordmark) di panel auth; ikon aplikasi/favicon `src/app/favicon.ico` (ganti logo dengan file bernama baru supaya cache gambar lama tidak terpakai); `public/brand` dikecualikan dari proxy login                                                            | Aset gambar di luar `public/brand` (dicegat proxy, gambar rusak)                                                                   |

Sejak I-08: halaman masuk dan verifikasi memakai `AuthLayout` (`src/app/login/auth-layout.tsx`,
panel brand navy dengan mark Veltinc di tengah dan lingkaran konsentris di kiri, form tanpa kartu
di kanan, footer Veltinc; HP memakai header brand ringkas). Style auth di `auth-layout.css`
memakai token brand yang sudah ada; login menyediakan tombol tampil/sembunyikan password.
Google, reset password mandiri, dan pilihan bahasa belum tersedia. Daftar (`listEmptyState`) di-scroll di dalam
kotak tabelnya dengan judul kolom dan kolom pengenal yang menempel; kolom `optional` disembunyikan di
bawah 768px. Layar scan ada untuk penerimaan, pengiriman (RU-03, I-01), opname
(`/inventory/opname/<id>/scan`, I-04), dan pindah lokasi (`/inventory/transfer/scan`, I-05).
Masih tersisa: pemilih tema gelap (token gelap sudah ada).

## Arah visual

- **Warna = makna.** Dasar netral sedikit dingin dengan token semantik di `globals.css` (terang
  dan gelap, kontras WCAG AA; utilitas `text-bonded`, `bg-warning-soft`, dst.), dipakai hanya
  untuk artinya:
  - `--bonded`: dulu penanda gudang berikat; sejak RM-02 semua gudang berikat, jadi jangan dipakai
    untuk membedakan gudang.
  - `--success`, `--warning`, `--destructive`: selesai/terdaftar, perlu perhatian (belum siap,
    menunggu persetujuan, selisih), ditolak/gagal.
  - `--info`: status proses (diajukan, menunggu respon).
  - Warna dasar dari brand kit Veltinc (keputusan user 20/10/2026): aksen biru (`--primary`
    #0061fc, tombol utama rata tanpa gradasi, hover `--primary-dark` #004fd1) hanya untuk aksi utama, link, dan
    fokus; jangan pakai warna untuk dekorasi. Sidebar navy (`--sidebar` #081734, item aktif
    `--sidebar-accent` #12306a, ikon aktif cyan `--sidebar-primary`); di dalam sidebar pakai token
    `sidebar-*` (termasuk `text-sidebar-muted`), bukan `muted-foreground` atau `bg-background`.
  - Radius mengikuti skala brand kit 8/10/12/16/20 (`rounded-md` 8, `rounded-lg` 10 untuk tombol
    dan input, `rounded-xl` 12, `rounded-2xl` 16 untuk kartu form, `rounded-3xl` 20); teks tombol
    medium (500).
  - Tombol dan status mengikuti brand kit: tombol hapus/batal dokumen (`variant="destructive"`)
    merah penuh dengan teks putih; `StatusBadge` selalu pill berlatar `-soft` dengan titik dan teks
    berwarna sesuai tone.
  - Tombol buat data baru di action bar daftar cukup berlabel "Buat", tanpa nama data di
    belakangnya (bukan "Buat BC 2.0" atau "Tambah produk"; keputusan user 20/10/2026). Judul
    halaman buat tetap menyebut datanya.
- **Acuan tampilan: hmx-002** (`~/hmx/hmx-002/hmx/module/basic/webx/static`, keputusan user
  15/10/2026, backlog RU-20–RU-23): token shell di `css/layout/layout.css`, tombol di
  `css/buttons.css`, sidebar di `css/layout/sidebar/`, action bar dan pencarian di
  `css/layout/action-manager/` dan `css/views/search/`, form di `vue/views/form/`. Ambil susunan,
  ukuran, dan perilakunya; tetap pakai komponen shadcn base-ui repo ini.
- **Tipografi** (brand kit Veltinc): Figtree untuk UI, Montserrat 700 hanya untuk judul halaman
  (`font-display text-page-title` = 28px di `h1` PageHeader dan dokumen; judul kartu, dialog, dan sheet tetap Figtree), dan
  JetBrains Mono untuk kode (diatur di `src/app/layout.tsx`); teks kontrol dan tabel 14px (`text-control`), teks kecil 12px
  (`text-caption`), kontrol 40px, header tabel 48px, baris 44px; angka dengan
  `tabular-nums`; font mono hanya untuk kode resmi yang dicocokkan karakter per karakter (nomor aju,
  NPWP/NITKU, kode HS, SKU). Hierarki dari ukuran dan bobot, bukan dari warna abu-abu bertingkat.
- **Kepadatan**: desktop padat (baris tabel ~36px, `text-sm`), area kerja tablet longgar
  (target sentuh ≥ 44px). Jangan menyamakan keduanya.
- **Ruang kosong punya tujuan**: kelompokkan yang berhubungan, pisahkan yang tidak; jangan
  membungkus semuanya dalam kartu berbingkai.

## Padanan hmx webx

Diambil dari skill hmx untuk agen (`~/hmx/hmx-002/hmx/module/basic/ai_coworker/skills/`:
`hmx-development-webx`, `hmx-development-widget-catalog`, `hmx-development-pattern-discovery`)
dan `~/hmx/FUNDAMENTAL_REPO_GUIDE.md` §3.1 (keputusan user 16/10/2026). Mekanisme webx (Vue 3 file,
bundle `__hmx__.py`, `VueComponent.push`, `useFetch`, view XML, ikon SVG hmx) **tidak** dipakai di
repo ini; yang diambil adalah cara kerja dan perilaku tampilannya.

### Cari contoh baku dulu

Sebelum membuat layar atau pola baru, cari dua hal dan sebutkan di rencana:

1. Layar hmx yang setara: view XML modulnya (mis. `core_inventory/views/*.xml`) dan widget yang
   dipakai field-nya, lalu file Vue/CSS webx-nya bila perilakunya perlu dilihat.
2. Halaman repo ini yang sudah memakai pola itu (mis. detail transfer untuk dokumen bertahapan,
   master produk untuk data master). Baca alurnya utuh (halaman, komponen, aksi server, query),
   bukan satu file.

Bila ada beberapa pola di repo, ikuti yang paling baru (lihat `git log` file-nya) dan tercatat di
skill ini. Bila belum ada padanannya, tulis polanya di skill ini setelah dibuat.

### Urutan mengubah tampilan

Mengikuti urutan webx (XML → widget modul → client action → extension → core), pakai jalan
paling ringan yang cukup:

1. Atur di halaman: kolom, urutan field, `span`, prop komponen bersama yang sudah ada.
2. Tambah prop atau varian pada komponen bersama (`DataTable`, `DocumentLayout`, `FormSection`, …)
   bila kebutuhannya berlaku di lebih dari satu halaman.
3. Buat komponen bersama baru di `src/components/<area>/` bila polanya belum ada.
4. Ubah komponen dasar `src/components/ui/` atau token `globals.css` hanya bila perubahannya memang
   untuk semua halaman; sebutkan halaman yang terdampak dan cek screenshot-nya.

Melompati langkah harus bisa dijelaskan alasannya. Jangan menyalin komponen ke halaman lalu
mengubahnya di sana.

### Widget hmx → komponen repo ini

| Widget/pola hmx                                                     | Pakai di repo ini                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `statusbar` (header form)                                           | `StatusSteps` di `DocumentLayout status` (deretan tahap tanpa dropdown, sejajar tombol dan membungkus di HP)         |
| `badge` (status di list)                                            | `StatusBadge` / `TransferStatusBadge` dengan tone semantik                                                           |
| `many2one`, `hx-searchable-dropdown`                                | `SearchSelect`; kode resmi `[kode] nama` → `RefCodeSelect`; kategori → `ProductCategorySelect`                       |
| `one2many` / `relational_v2` (tabel baris)                          | `DataTable` di tab `Barang` dokumen; form Draft: baris di `TransferForm`                                             |
| `o2m-quick-view-drawer`, `modal-form-drawer`                        | `Sheet` sisi kanan, mis. `ReceiptLotEditor` (rincian satu baris)                                                     |
| `many2many_tags`, `many2many_chips`                                 | Chip yang bisa dilepas + tombol pemilih (`TransfersField` di form dokumen BC, H-04); mode baca: tautan dipisah spasi |
| `boolean` / `boolean_toggle`                                        | `CheckboxField`                                                                                                      |
| `selection_radio`, `radio_card_selection`                           | radio biasa ber-label (contoh: pilihan sisa qty di dialog Validasi)                                                  |
| `float`, `monetary`                                                 | input `inputMode="decimal"` + `formatDecimal`/`parseDecimalInput` (`src/lib/decimal.ts`)                             |
| `date`, `datetime`                                                  | `Input type="date"` + `formatDate`/`formatDateTime` (`src/lib/format.ts`, WIB)                                       |
| field readonly                                                      | `StaticField` (mode baca `RecordModes`), bukan input disabled                                                        |
| `form-sheet-notebook`                                               | `Tabs` (`form-notebook`)                                                                                             |
| `form-groups`, `form-side-by-side-group`                            | `FormSection` + `span`, `FormColumns`/`FormColumn`                                                                   |
| `form-sheet-chatter`, `form-sheet-log-activity`, `approval_history` | `ActivityLog` di `DocumentLayout activity` (dari audit log)                                                          |
| `form-sheet-action-buttons`, `hx-smart-dropdown-button`             | `DocumentLayout actions` / `PageHeader actions`; menu ⋯ di `ListToolbar`                                             |
| `form-sheet-smart-buttons` (jumlah dokumen terkait)                 | Belum ada; tautan dokumen terkait di `InfoGrid` (mis. Retur, Lanjutan dari)                                          |
| `barcode_scanner`                                                   | Layar scan: pola `ReceiptScanner` (input selalu fokus, `role="status"`)                                              |
| `list-view-optional-column`                                         | `DataTable` kolom `optional: "show" \| "hide"` (RU-22)                                                               |
| `list-view-group*`                                                  | `DataTable group` + Kelompokkan di `ListSearchBar`                                                                   |
| search view (filter, group by, favorit)                             | `ListSearchBar` (chip filter, disimpan di URL)                                                                       |
| `form-breadcrumb`                                                   | `AppBreadcrumb` lewat `PageHeader`/`DocumentLayout crumbs`                                                           |
| `quick` view (pratinjau record)                                     | Belum ada; buka halaman detail lewat `rowHref`                                                                       |
| `handle` (urut baris), `remaining_days`, `percentage_pie`           | Belum dipakai; buat komponen bersama bila dibutuhkan                                                                 |

Saat menerjemahkan layar hmx, cari widget field-nya di view XML lalu pakai padanan di atas. Bila
widget hmx-nya tidak ada di tabel, cek katalog lengkap di `hmx-development-widget-catalog` dan
tambahkan barisnya di sini setelah padanannya dibuat.

### Tabel lebar

Di hmx, header tabel menempel saat di-scroll dan kolom penting menempel di kiri (`relational-table-v2.css`:
`.is-sticky`, `.pinned-divider`); kolom tambahan ditandai opsional. Di repo ini (I-08):

- Kolom pengenal (nomor/SKU + nama) paling kiri; kolom tambahan diberi `optional` (juga
  disembunyikan otomatis di bawah 768px).
- `DataTable` daftar (`listEmptyState`) di-scroll di dalam kotaknya (`max-h` setinggi layar); judul
  kolom menempel di atas dan kolom pertama (beserta kotak centang) menempel di kiri. Tautan baris
  dipasang di sel kedua (`data-row-link`) karena sel yang menempel menjadi wadah posisi. Jangan
  menambah CSS sticky per halaman. Tombol aksi baris jangan sampai hanya terlihat setelah scroll ke
  samping.

## Aturan per pola

### Halaman daftar

- Header ringkas: judul di kiri, import/export di kanan; daftar tanpa deskripsi di bawah judul.
- Toolbar: Buat di kiri, cari/filter di tengah, pager di kanan; filter aktif terlihat dan bisa dihapus.
- Tabel: kolom pengenal (kode/SKU) dan nama paling kiri dan paling tebal; angka rata kanan dengan
  satuan; status hanya untuk pengecualian; aksi baris rata kanan dan muncul jelas saat fokus.
- Seluruh baris boleh jadi tautan ke detail bila aksinya memang membuka detail.
- Kosong (keputusan user 18/10/2026, mengikuti hmx): tabel tetap tampil dengan judul kolom dan baris
  pengisi sampai 5 baris, tanpa pesan atau tombol di tengah; aksi Buat tetap di toolbar. Pesan kosong
  di tabel detail (barang, pergerakan) dan pesan izin (mis. belum diberi akses gudang) tetap tampil.

### Form

- Kelompokkan per arti (Data produk, Data kepabeanan) dengan judul kelompok; dua kolom di desktop
  bila field pendek, satu kolom di HP.
- Urutan baku (UF-03): kolom kiri **siapa/di mana** (jenis/arah, partner, gudang/lokasi asal, lokasi
  tujuan), kolom kanan **kapan/rujukan** (tanggal rencana, referensi, nomor dokumen luar); di
  bawahnya lebar penuh **alasan** lalu **catatan**; lalu bagian Barang. `FormActions` ada di **atas** form (tidak menempel saat di-scroll)
  (Simpan dulu, aksi sekunder, aksi berbahaya di kanan). Master data: kiri identitas (kode, nama,
  jenis), kanan atribut (satuan, kategori, status).
- Label singkat; hint hanya untuk aturan yang tidak tertebak (format NITKU, arti faktor konversi).
- Error: ringkasan di **atas** form (dengan `role="alert"`, berisi semua kesalahan sekaligus,
  sesuai PRD 7.6) plus pesan di bawah field terkait. Fokus pindah ke ringkasan setelah submit gagal.
- Field yang tidak bisa diubah (SKU, kode, satuan stok) tampil sebagai teks + alasan singkat,
  bukan input disabled abu-abu.
- Peran baca-saja (Auditor, peran tanpa `master:write`) melihat tampilan baca yang rapi, bukan
  form yang semua field-nya disabled.

### Dokumen BC

- Halaman create/detail/revisi tidak menampilkan H1; identitas dokumen tetap di breadcrumb.
- Header detail tidak menampilkan tanggal. Tanggal di field dokumen dan log aktivitas tetap ada.
- Hapus dan Duplikat melalui seleksi di daftar. Submit hanya di mode baca dokumen Draft;
  saat edit tampil Simpan/Buang tanpa Submit agar perubahan lokal tidak terlewati.
  Tombol Batalkan dokumen dan summary kekurangan Draft tidak ditampilkan.
- Field wajib diberi `*` dan validasi kontrol berdasarkan aturan aktif `doc_validation_rules`;
  submit yang menemukan field kosong mengarahkan ke tab field tersebut.
- Unduh PDF/Excel hanya di kanan judul **daftar** BC, mengikuti pola export/import inventory.
  Isinya rekap daftar sesuai pencarian/filter aktif, mencakup seluruh halaman.

### Status dan angka

- Pakai komponen status bersama dengan warna semantik di atas; teks status selalu ada (jangan
  mengandalkan warna saja).
- Qty 4 desimal, uang 2 desimal, tanggal DD/MM/YYYY, zona Asia/Jakarta: lewat `src/lib/format.ts`
  dan `src/lib/decimal.ts`; jangan memformat angka sendiri di komponen.
- Konversi satuan ditulis eksplisit: "1 TON = 1.000 KG", "1 PCS = 1 PCE".

### Layar tablet/HP (penerimaan, pengiriman, opname)

- Satu tugas per layar, tombol utama di bawah dan mudah dijangkau, input scan langsung fokus dan
  kembali fokus setelah setiap scan, umpan balik jelas (berhasil, salah barang, qty lebih).
- Contoh acuan: `ReceiptScanner` (`/inventory/penerimaan/[id]/scan`): kode produk memilih baris,
  kode lain dicatat sebagai lot/nomor seri baris aktif (`addLotScan` di `src/lib/receipt-lots.ts`),
  pesan di `role="status"`, Simpan/Buang menempel di bawah layar HP. Rincian yang sama bisa diisi
  lewat keyboard di detail (`ReceiptLotEditor`, panel samping; Enter di qty menambah baris).

## Batasan teknis repo

- Kode dibagi tiga modul (S-01, README bagian Modul): komponen/aksi inventory di
  `src/modules/inventory`, kepabeanan di `src/modules/it-inventory`, komponen UI bersama tetap di
  `src/components`. Komponen bersama tidak boleh mengimpor modul; halaman di `src/app` merakit.

- Komponen shadcn versi **base-ui** di `src/components/ui`: komposisi lewat prop `render`, bukan
  `asChild`. Jangan menambah library UI lain.
- Pakai komponen bersama yang sudah ada sebelum membuat baru: `PageHeader`, `FormField`,
  `StaticField`, `FormSection`, `CheckboxField`, `FormErrors`, `StatusBadge`, `NameCell`,
  `DataTable*`, `listEmptyState`, `RefCodeSelect`, `ModulePlaceholder`.
  Bila polanya berubah, ubah komponen bersamanya, bukan menyalin ke halaman.
- Bagian yang membaca sesi atau `searchParams` dibungkus `<Suspense>` dengan fallback yang
  bentuknya sama dengan kontennya (skeleton bentuk tabel/form, bukan teks "Memuat…").
- Semua teks UI berbahasa Indonesia, kalimat biasa (bukan Title Case), istilah domain apa adanya
  (BC, NITKU, berikat, aju, TPS). Tombol memakai kata kerja: Simpan, Ajukan, Setujui, Arsipkan. Tombol simpan form selalu "Simpan" saja (bukan "Simpan penerimaan", "Simpan perubahan"), saat proses "Menyimpan…".
- Aksesibilitas (PRD 11): semua aksi bisa dengan keyboard, fokus terlihat, label terhubung ke
  input (`htmlFor`/`id` unik per halaman), kontras AA di tema terang dan gelap.

## Pemeriksaan akhir (wajib sebelum bilang selesai)

1. Render halaman yang diubah lewat server tes (`npm run build` lalu `next start --port 3100`
   dengan `DATABASE_URL` database tes; sesi Administrator di `playwright/.auth/admin.json`) dan
   ambil screenshot **desktop 1366px** dan **HP 390px**. Tunggu sampai data tampil, bukan skeleton:
   tunggu elemen data (baris tabel, isi form), bukan teks yang juga ada di header statis, karena
   isi halaman di-stream belakangan.
2. Lihat screenshot-nya sungguh-sungguh, lalu jawab:
   - Apa hal terpenting di layar ini, dan apakah itu yang paling menonjol?
   - Adakah badge, ikon, deskripsi, atau bingkai yang bisa dihapus tanpa kehilangan informasi?
   - Apakah warna yang dipakai semuanya bermakna?
   - Apakah state kosong, error, loading, tanpa izin, dan arsip sudah ditangani?
   - Ada teks terpotong, tumpang tindih, atau scroll horizontal di HP?
3. Cek dengan keyboard saja: Tab ke semua kontrol, submit form, pilih opsi `[kode] nama`.
4. Jalankan `npm run lint`, `npm run typecheck`, tes terkait, dan perbarui tes e2e bila teks atau
   struktur berubah.
5. Ringkas perubahan dan sebutkan apa yang belum ditangani.
