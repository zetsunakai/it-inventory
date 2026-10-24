# Standar halaman daftar dan form

Gunakan komponen bersama berikut untuk halaman baru maupun pembaruan halaman lama.

## Halaman daftar

- `ListLayout` membungkus judul, aksi header (impor/ekspor), dan isi halaman dengan jarak yang sama. Semua halaman daftar tidak menampilkan teks deskripsi di bawah judul.
- `ListToolbar` menempatkan aksi Buat di kiri, pencarian/filter di tengah, dan `ListPager` di kanan. Pada layar kecil susunannya bertumpuk.
- Gunakan `ListSearchBar`, `DataTable`, `listEmptyState`, dan `DataTableSkeleton` untuk pencarian, tabel, kondisi kosong, serta loading.
- Pertahankan batas `Suspense` di pemilik data. Header statis tidak perlu menunggu query tabel.
- Gunakan `Section` untuk tabel tambahan, seperti kategori satuan dan lokasi virtual.
- Izin, filter, pagination, dan urutan data tetap ditentukan oleh halaman/query masing-masing.

## Halaman detail dan form

- `DocumentLayout` menjadi kerangka halaman detail, termasuk detail yang hanya dapat dibaca dan halaman impor.
- `NewRecordLayout` menjadi kerangka form record baru; komponen ini menggunakan `DocumentLayout` dan aktivitas record yang belum disimpan.
- `RecordModes` mengatur mode baca/edit pada record yang dapat diubah.
- Panel Aktivitas selalu tertutup saat membuka form atau berpindah record. Panel hanya terbuka lewat tombol pengguna, dan menyusut ke kanan saat ditutup. Pada desktop, form otomatis melebar saat Aktivitas ditutup dan menyempit saat dibuka; status berada pada area isi sehingga tidak menyisakan kolom kanan berlebar tetap. Preferensi panel dari kunjungan sebelumnya tidak diterapkan.
- Gunakan `FORM_CLASS`, `FormActions`, `FormSection`, dan `FormField` untuk form. Aksi ada di atas isi; field wajib dan kesalahan ditampilkan pada field terkait.
- Field alamat memakai `Textarea` selebar satu kolom (`span={6}`), tinggi awal dua baris (`rows={2}`), pembungkusan teks, dan resize vertikal. Pada mode baca, gunakan `StaticField multiline` agar baris baru tetap terlihat.
- Gunakan `ViewSection` dan `StaticField` untuk informasi mode baca. Gunakan span yang sama dengan form edit.
- Pada form master, gunakan pasangan field 6:6 agar batas kolom konsisten antarbaris. Kode dan nama memakai lebar yang sama; hindari campuran 4:8, 8:4, atau 3:6:3 di section yang juga memakai dua kolom. Field panjang boleh memakai span 12. Terapkan susunan yang sama pada mode baca dan edit.
- Gunakan `FormColumns`/`FormColumn` atau span pada `FormField` untuk lebar field, dengan aturan ukuran dan spacing di `src/app/globals.css`.
- Status tampil sebagai deretan tahap berbentuk kapsul dengan border dan tahap aktif memakai warna tema utama. Status sejajar di kanan tombol aksi, termasuk Simpan/Buang pada form; bila tidak ada tombol aksi, status tampil di atas isi. Pada layar kecil tahap membungkus ke baris berikutnya, tanpa dropdown dan tanpa scroll horizontal. Label status mengikuti alur dokumen yang ada.
- Status dan aktivitas diberikan ke slot `DocumentLayout` bila datanya tersedia. Detail lot/kartu stok tidak perlu aktivitas audit atau tombol edit yang tidak sesuai fungsinya.
- Halaman impor menyediakan breadcrumb kembali ke daftar atau record induk; input file mengikuti `FormSection` dan `FormField`.

Dashboard, visualisasi flow dokumen, dan layar scan menggunakan layout yang sesuai tugasnya. Ketiganya tetap memakai komponen UI bersama, tanpa dipaksakan menjadi halaman daftar atau form record.

## Editable bottom

- Gunakan `RelationalTable` untuk menambah baris di bawah tabel. Baris baru langsung masuk mode edit dan field pertamanya menerima fokus.
- Detail gudang memakai tabel lokasi di dalam `WarehouseForm`, baik saat membuat gudang maupun mengeditnya. Kode dan tipe lokasi yang sudah tersimpan tetap terkunci.
- Tambah, ubah, dan hapus lokasi hanya mengubah draft di browser. Tombol Simpan gudang menyimpan induk beserta semua perubahan lokasi dalam satu transaksi. Buang menghapus draft yang belum disimpan.
- Lokasi induk dapat dipilih dari baris baru yang belum tersimpan. Server memvalidasi kepemilikan gudang, hierarki, status induk, dan penggunaan lokasi sebelum menyimpan.
- Saat form dibuka dalam mode edit, baris yang sudah ada tetap tampil sebagai teks tanpa tombol pensil atau ceklis. Klik area baris langsung membuka editor baris dan memfokuskan field yang diklik atau field pertama. Kontrol seleksi, tautan, dan tombol aksi tetap menjalankan aksinya sendiri. Klik di luar tabel menutup editor tanpa membuang draft. Dropdown dan dialog pemilihan milik tabel tetap dianggap bagian dari tabel. Mode baca tidak membuka editor.
- Header kolom hanya menampilkan label dan penanda wajib, tanpa pencarian atau pengurutan per kolom.
- Popup wizard tidak termasuk perubahan ini.

## Tabel baca dan edit

- Tabel relasi mode baca menggunakan `RelationalView`, yang memakai renderer `RelationalTable` yang sama dengan mode edit. Kolom serta preferensi tampil/sembunyi menggunakan ID tabel serta kolom yang sama. Urutan kolom mengikuti definisi form; fitur geser kolom dan preferensi urutan lama tidak digunakan.
- Lebar kolom data dibagi rata dalam lebar tabel yang mengikuti kontainer, tanpa scroll horizontal. Ukurannya tetap saat beralih baca/edit. Resize dan pin kolom tidak tersedia; preferensi lebar dan pin lama diabaikan. Kolom Seri, seleksi, dan Aksi juga tidak dikunci secara horizontal.
- Kolom Barang transfer, antar gudang, retur, lokasi gudang, dan ringkasan barang BC mengikuti metadata bersama. Qty dan satuan tetap terpisah pada mode baca maupun edit.
- Informasi operasional tambahan (stok tersedia, reservasi, hasil perpindahan) tetap mengikuti status dokumen. Detail barang BC dapat dibuka pada mode baca dengan field yang sama seperti detail edit.
