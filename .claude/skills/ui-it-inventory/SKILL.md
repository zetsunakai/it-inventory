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

Konsep domain yang harus terlihat jelas di UI: **gudang berikat vs non-berikat**, **status dokumen
BC** (Draft → Siap ajukan → Diajukan → Terdaftar / Ditolak / Batal), **siap/belum siap dokumen BC**,
**selisih** (opname, qty dokumen vs transfer), **arsip**, dan **periode tertutup**.

## Pola yang sudah ditetapkan (redesign putaran 1)

Pakai komponen ini; jangan kembali ke pola lama yang terasa slop.

| Kebutuhan                    | Pakai                                                                                                                 | Hindari                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Status / pengecualian        | `StatusBadge` (`src/components/status-badge.tsx`) dengan tone semantik                                                | `Badge` shadcn berwarna abu-abu, pill "Aktif" di setiap baris      |
| Nama di tabel + arsip        | `NameCell archived={!row.active}` dan `rowMuted` di `DataTable`                                                       | Kolom "Status" berisi Aktif/Arsip                                  |
| Buka detail dari daftar      | `DataTable rowHref` (seluruh baris jadi tautan)                                                                       | Kolom "Aksi" berisi link "Ubah"                                    |
| Daftar kosong                | `listEmptyState()` (`src/components/data-table/empty-state.tsx`)                                                      | "Tidak ada data." tanpa jalan keluar                               |
| Angka di tabel               | kolom `align: "right"`; tabel sudah `tabular-nums`                                                                    | Angka rata kiri                                                    |
| Ringkasan error form         | `FormErrors` tepat setelah `<form>` (fokus otomatis)                                                                  | Ringkasan di bawah dekat tombol Simpan                             |
| Nilai yang tidak bisa diubah | `StaticField`                                                                                                         | `Input disabled` abu-abu                                           |
| Kelompok field               | `FormSection`                                                                                                         | `fieldset` polos tanpa judul                                       |
| Kembali ke daftar            | breadcrumb di header (`AppBreadcrumb`): Area › Modul › halaman dari `PageHeader` (`crumbs` = dokumen induk + nomor)   | Tombol "Kembali ke daftar" di setiap detail                        |
| Tombol alur dokumen          | `PageHeader actions` (kanan judul); hasilnya lewat `usePageMessage().show(result)` ke slot di bawah header            | Baris tombol + kotak pesan sendiri di bawah judul                  |
| Info detail dokumen/master   | `InfoGrid` (label di atas nilai, 3 kolom; `wide` untuk catatan/alasan) lalu `Section` per bagian                      | `dl` dua kolom memanjang, `h2` + `space-y` buatan sendiri          |
| Form                         | `FORM_CLASS` + `FormSection` + `FormColumns`/`FormColumn` (kiri siapa/di mana, kanan kapan/rujukan), `FormActions`    | `max-w-*` per halaman, field mengalir acak, tombol Simpan lepas    |
| Toolbar daftar               | `ListToolbar` (cari, filter, lalu aksi Buat di kanan)                                                                 | Susunan flex buatan sendiri per halaman                            |
| Ukuran                       | Token `text-control` (15px: input, tombol, menu, isi) dan `text-caption` (13px: judul kolom, petunjuk); kontrol 36px  | `text-xs`, `h-8`, ukuran khusus per halaman                        |
| Beranda                      | daftar "Perlu perhatian" dari data nyata (`src/server/queries/home.ts`)                                               | Kartu sapaan, angka karangan, duplikasi menu                       |
| Import/export master data    | `ImportExportActions` di `actions` `PageHeader`; halaman import pakai `ImportForm` + `ImportColumnGuide`              | Tombol Export/Import di toolbar tabel (toolbar jadi terlalu penuh) |
| Hapus data master            | `DeleteRecord` di bawah form detail (konfirmasi `AlertDialog`, pesan tolak dari server); filter `Status` di daftar    | Tombol hapus di baris tabel, hapus tanpa konfirmasi                |
| Ikon menu                    | Hanya untuk menu induk (area kerja) di `NAVIGATION`, masing-masing berbeda; menu anak tanpa ikon dan menjorok         | Ikon di setiap menu anak                                           |
| Logo                         | `public/brand/logo.png` di header sidebar (ganti file untuk ganti logo); `public/brand` dikecualikan dari proxy login | Aset gambar di luar `public/brand` (dicegat proxy, gambar rusak)   |

Masih tersisa untuk putaran berikutnya: halaman login masih kartu generik; tabel di HP belum
menyembunyikan kolom sekunder; belum ada pemilih tema gelap (token gelap sudah ada); layar
tablet untuk penerimaan/opname dibuat bersama M2.

## Arah visual

- **Warna = makna.** Dasar netral sedikit dingin dengan token semantik di `globals.css` (terang
  dan gelap, kontras WCAG AA; utilitas `text-bonded`, `bg-warning-soft`, dst.), dipakai hanya
  untuk artinya:
  - `--bonded`: penanda gudang/lokasi berikat (dipakai konsisten di mana pun gudang muncul).
  - `--success`, `--warning`, `--destructive`: selesai/terdaftar, perlu perhatian (belum siap,
    menunggu persetujuan, selisih), ditolak/gagal.
  - `--info`: status proses (diajukan, menunggu respon).
  - Aksen biru hmx (`--primary` #2a5ea2, tombol utama bergradasi ke `--primary-dark`) hanya untuk
    aksi utama, menu aktif, dan fokus; jangan pakai warna untuk dekorasi.
- **Acuan tampilan: hmx-002** (`~/hmx/hmx-002/hmx/module/basic/webx/static`, keputusan user
  15/10/2026, backlog RU-20–RU-23): token shell di `css/layout/layout.css`, tombol di
  `css/buttons.css`, sidebar di `css/layout/sidebar/`, action bar dan pencarian di
  `css/layout/action-manager/` dan `css/views/search/`, form di `vue/views/form/`. Ambil susunan,
  ukuran, dan perilakunya; tetap pakai komponen shadcn base-ui repo ini.
- **Tipografi**: Plus Jakarta Sans untuk UI (seperti hmx) dan IBM Plex Mono untuk kode (diatur di
  `src/app/layout.tsx`); teks kontrol dan tabel 14px (`text-control`), teks kecil 12px
  (`text-caption`), kontrol 40px, header tabel 48px, baris 44px; angka dengan
  `tabular-nums`; font mono hanya untuk kode resmi yang dicocokkan karakter per karakter (nomor aju,
  NPWP/NITKU, kode HS, SKU). Hierarki dari ukuran dan bobot, bukan dari warna abu-abu bertingkat.
- **Kepadatan**: desktop padat (baris tabel ~36px, `text-sm`), area kerja tablet longgar
  (target sentuh ≥ 44px). Jangan menyamakan keduanya.
- **Ruang kosong punya tujuan**: kelompokkan yang berhubungan, pisahkan yang tidak; jangan
  membungkus semuanya dalam kartu berbingkai.

## Aturan per pola

### Halaman daftar

- Header ringkas: judul, fakta penting bila ada (mis. "1.991 TPS"), aksi utama di kanan.
- Toolbar: cari, filter, lalu aksi; filter aktif terlihat dan bisa dihapus.
- Tabel: kolom pengenal (kode/SKU) dan nama paling kiri dan paling tebal; angka rata kanan dengan
  satuan; status hanya untuk pengecualian; aksi baris rata kanan dan muncul jelas saat fokus.
- Seluruh baris boleh jadi tautan ke detail bila aksinya memang membuka detail.
- Kosong: bedakan "belum ada data" (tawarkan aksi pertama, sesuai izin) dan "tidak ada hasil untuk
  filter ini" (tawarkan hapus filter).

### Form

- Kelompokkan per arti (Data produk, Data kepabeanan) dengan judul kelompok; dua kolom di desktop
  bila field pendek, satu kolom di HP.
- Urutan baku (UF-03): kolom kiri **siapa/di mana** (jenis/arah, partner, gudang/lokasi asal, lokasi
  tujuan), kolom kanan **kapan/rujukan** (tanggal rencana, referensi, nomor dokumen luar); di
  bawahnya lebar penuh **alasan** lalu **catatan**; lalu bagian Barang; lalu `FormActions`
  (Simpan dulu, aksi sekunder, aksi berbahaya di kanan). Master data: kiri identitas (kode, nama,
  jenis), kanan atribut (satuan, kategori, status).
- Label singkat; hint hanya untuk aturan yang tidak tertebak (format NITKU, arti faktor konversi).
- Error: ringkasan di **atas** form (dengan `role="alert"`, berisi semua kesalahan sekaligus,
  sesuai PRD 7.6) plus pesan di bawah field terkait. Fokus pindah ke ringkasan setelah submit gagal.
- Field yang tidak bisa diubah (SKU, kode, satuan stok) tampil sebagai teks + alasan singkat,
  bukan input disabled abu-abu.
- Peran baca-saja (Auditor, peran tanpa `master:write`) melihat tampilan baca yang rapi, bukan
  form yang semua field-nya disabled.

### Status dan angka

- Pakai komponen status bersama dengan warna semantik di atas; teks status selalu ada (jangan
  mengandalkan warna saja).
- Qty 4 desimal, uang 2 desimal, tanggal DD/MM/YYYY, zona Asia/Jakarta: lewat `src/lib/format.ts`
  dan `src/lib/decimal.ts`; jangan memformat angka sendiri di komponen.
- Konversi satuan ditulis eksplisit: "1 TON = 1.000 KG", "1 PCS = 1 PCE".

### Layar tablet/HP (penerimaan, pengiriman, opname)

- Satu tugas per layar, tombol utama di bawah dan mudah dijangkau, input scan langsung fokus dan
  kembali fokus setelah setiap scan, umpan balik jelas (berhasil, salah barang, qty lebih).

## Batasan teknis repo

- Komponen shadcn versi **base-ui** di `src/components/ui`: komposisi lewat prop `render`, bukan
  `asChild`. Jangan menambah library UI lain.
- Pakai komponen bersama yang sudah ada sebelum membuat baru: `PageHeader`, `FormField`,
  `StaticField`, `FormSection`, `CheckboxField`, `FormErrors`, `StatusBadge`, `NameCell`,
  `DataTable*`, `listEmptyState`, `RefCodeSelect`, `ModulePlaceholder`.
  Bila polanya berubah, ubah komponen bersamanya, bukan menyalin ke halaman.
- Bagian yang membaca sesi atau `searchParams` dibungkus `<Suspense>` dengan fallback yang
  bentuknya sama dengan kontennya (skeleton bentuk tabel/form, bukan teks "Memuat…").
- Semua teks UI berbahasa Indonesia, kalimat biasa (bukan Title Case), istilah domain apa adanya
  (BC, NITKU, berikat, aju, TPS). Tombol memakai kata kerja: Simpan, Ajukan, Setujui, Arsipkan.
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
