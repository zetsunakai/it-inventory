# Penyelarasan tabel relasi dengan HMX

Referensi: `/home/dio/hmx/hmx-002/hmx/module/basic/webx/static/{vue,css}/views/fields/relational/relational-table-v2.*` dan `many2one-field.vue`.

## Rencana

1. Komponen React tabel relasi menggunakan Table, Input, Button, Checkbox, menu, dan token tema yang sudah ada. DataTable tetap melayani daftar server; editor relasi memerlukan state dan callback client sehingga dibangun sebagai komposisi primitive yang sama.
2. Tabel menyediakan header sticky, sort/filter per kolom, resize, pin kolom/baris, pilihan kolom tersimpan, pagination, seleksi/hapus massal, nomor baris, tambah di bawah, dan agregat. Filter/sort/pagination tidak mengubah urutan payload. Reorder eksplisit hanya pada daftar yang mengizinkan.
3. Migrasi transfer dan antar-gudang ke edit per baris. Migrasi daftar berulang BC serta lampiran ke tabel. Barang BC memakai baris ringkas dengan detail terbuka di bawah baris agar validasi form dan daftar bertingkat tetap satu form.
4. Tingkatkan SearchSelect dan RefCodeSelect dengan pencarian lanjutan berbentuk tabel, halaman berikutnya, status loading/error/retry, dan akses detail record produk/partner yang sudah tersedia. Pembuatan master tetap memakai halaman master dan izin yang ada; tidak menambahkan jalur create baru dari selector.
5. Identitas baris BC berupa metadata Symbol lokal yang tetap ikut object spread tetapi tidak masuk JSON. Pemilih tidak menghapus nilai terpilih saat nilai tersebut tidak ada di halaman hasil.
6. Query lookup memakai pagination terbatas dan mengambil satu item tambahan untuk hasMore. Pertahankan autentikasi, izin BC, active-only, dan filter induk referensi.
7. Verifikasi typecheck, lint, build, tes database yang terkait, dan E2E untuk edit/sort/filter/delete, pencarian lintas halaman, penyimpanan, serta viewport desktop/mobile.

## Kriteria penerimaan

- Nilai baris tidak tertukar atau hilang ketika disortir, difilter, dipaginasi, atau baris sebelumnya dihapus.
- Nomor seri selalu berdasarkan urutan sumber, bukan urutan tampilan hasil sort.
- Pengurutan manual mengubah urutan sumber secara eksplisit.
- Agregat qty dipisahkan berdasarkan satuan; hitung tampilan memakai desimal eksak.
- Error wajib membuka baris/halaman/kolom yang benar; seluruh data tetap dikirim melalui JSON form.
- Dropdown tetap menggunakan portal; tabel tidak membuat halaman melebar pada viewport kecil.
- Pencarian lanjut dapat mencapai hasil ke-21 dan seterusnya tanpa mengubah batas dropdown awal.

## Hasil pelaksanaan

Selesai pada 20 Oktober 2026.

### Implementasi

- `src/components/relational/relational-table.tsx`: header sticky, sort/filter per kolom, resize dengan pointer/keyboard, pin kolom/baris, kolom opsional dan urutannya tersimpan di browser, pagination, seleksi/hapus massal dengan konfirmasi, batas minimum baris, footer agregat, serta edit per baris.
- Transfer penerimaan/pengiriman/pindah lokasi/pemakaian/penyesuaian, antar-gudang, dan retur memakai komponen bersama. Qty dijumlahkan secara eksak dan dikelompokkan berdasarkan satuan.
- Seluruh daftar berulang BC dan lampiran memakai tabel yang sama. Barang BC memiliki ringkasan dan detail di bawah baris; daftar bertingkat dan unggah file tetap menggunakan kontrol lama. Reorder eksplisit tersedia pada daftar BC yang menyimpan nomor seri.
- Identitas lokal memakai Symbol dan dipertahankan saat edit/reorder/delete. Metadata tidak dikirim ke server. Penambahan entitas melalui field utama juga dinormalisasi agar tidak menghasilkan baris tanpa identitas.
- `SearchSelect` dan `RefCodeSelect` berbagi autocomplete, muat lebih banyak, selector lanjut berbentuk drawer tabel, pagination, status loading/error/retry, serta tautan detail produk/partner/referensi. Nilai form referensi tetap kode; lookup menambahkan id untuk tautan detail.
- Nilai produk/partner pada tampilan baca transfer dan produk pada tampilan baca BC ditautkan ke master terkait.
- Error native membuka baris/halaman/kolom yang benar meski tersembunyi filter. Editor tetap terpasang agar validasi dan isian nested tetap terjaga.
- Layout utama diberi `min-width: 0` untuk containment tablet. Pada ponsel, tabel digeser horizontal di dalam kotaknya dan pin horizontal tidak membekukan area input. Detail BC mengikuti lebar kontainer.

### Verifikasi

- `npm test`: **59 file, 501 tes lulus**.
- `npm run lint`: lulus tanpa warning/error.
- `npm run typecheck`: lulus.
- Build production berhasil melalui `webServer` pada `npm run test:e2e`.
- Run E2E penuh: **58 lulus, 1 gagal** karena assertion respons referensi lama belum menyertakan id yang kini dipakai tautan detail. Assertion diperbarui untuk memverifikasi id beserta kode/nama/induk. Rerun terarah `npm run test:e2e -- tests/e2e/base/ref-codes.spec.ts --grep 'menambah TPS'`: **2 lulus**, termasuk setup MFA. Semua 59 tes unik dari run penuh telah terverifikasi; bukan 60 tes dalam satu run.
- Tujuh skenario E2E baru meliputi edit/sort/filter/delete/save/reload, lookup halaman kedua, preferensi/pagination/payload, desktop/tablet/mobile, reorder BC, validasi baris tersembunyi, dan simpan BC saat detail ditutup.
- Pemeriksaan browser tambahan: resize produk 340 → 360 px; pin kolom pada offset 112 px; pin baris memindahkan baris yang tepat; hapus massal menyisakan nilai baris ketiga dan menjaga minimum satu baris; selector pulih setelah HTTP 500 dan retry. Tidak ada page error pada pemeriksaan resize/pin/responsivitas.
- Screenshot diperiksa pada lebar **1440, 768, 390 px**. Pemeriksaan tema gelap dilakukan dengan kelas `.dark` dan `color-scheme: dark`, karena tidak ada pergantian tema normal yang ditambahkan oleh perubahan ini. Screenshot lokal ada di `/tmp/it-inventory-relational-ui/`.
- `git diff --check`: lulus.

### Keputusan cakupan

- Detail barang BC menggunakan ekspansi di dalam form, bukan memindahkan kontrol required/nested/upload ke portal drawer. Selector foreign key menggunakan drawer.
- Pembuatan master baru tetap melalui halaman master dengan izin yang sudah ada. Tidak ada jalur quick-create tambahan.
- Tidak ada perubahan schema/migrasi database, commit, atau push.
