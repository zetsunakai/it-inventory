# Standar halaman daftar dan form

Gunakan komponen bersama berikut untuk halaman baru maupun pembaruan halaman lama.

## Halaman daftar

- `ListLayout` membungkus judul, deskripsi, aksi header (impor/ekspor), dan isi halaman dengan jarak yang sama.
- `ListToolbar` menempatkan aksi Buat di kiri, pencarian/filter di tengah, dan `ListPager` di kanan. Pada layar kecil susunannya bertumpuk.
- Gunakan `ListSearchBar`, `DataTable`, `listEmptyState`, dan `DataTableSkeleton` untuk pencarian, tabel, kondisi kosong, serta loading.
- Pertahankan batas `Suspense` di pemilik data. Header statis tidak perlu menunggu query tabel.
- Gunakan `Section` untuk tabel tambahan, seperti kategori satuan dan lokasi virtual.
- Izin, filter, pagination, dan urutan data tetap ditentukan oleh halaman/query masing-masing.

## Halaman detail dan form

- `DocumentLayout` menjadi kerangka halaman detail, termasuk detail yang hanya dapat dibaca dan halaman impor.
- `NewRecordLayout` menjadi kerangka form record baru; komponen ini menggunakan `DocumentLayout` dan aktivitas record yang belum disimpan.
- `RecordModes` mengatur mode baca/edit pada record yang dapat diubah.
- Gunakan `FORM_CLASS`, `FormActions`, `FormSection`, dan `FormField` untuk form. Aksi ada di atas isi; field wajib dan kesalahan ditampilkan pada field terkait.
- Field alamat memakai `Textarea` selebar satu kolom (`span={6}`), tinggi awal dua baris (`rows={2}`), pembungkusan teks, dan resize vertikal. Pada mode baca, gunakan `StaticField multiline` agar baris baru tetap terlihat.
- Gunakan `ViewSection` dan `StaticField` untuk informasi mode baca. Gunakan span yang sama dengan form edit.
- Pada form master, gunakan pasangan field 6:6 agar batas kolom konsisten antarbaris. Kode dan nama memakai lebar yang sama; hindari campuran 4:8, 8:4, atau 3:6:3 di section yang juga memakai dua kolom. Field panjang boleh memakai span 12. Terapkan susunan yang sama pada mode baca dan edit.
- Gunakan `FormColumns`/`FormColumn` atau span pada `FormField` untuk lebar field, dengan aturan ukuran dan spacing di `src/app/globals.css`.
- Status dan aktivitas diberikan ke slot `DocumentLayout` bila datanya tersedia. Detail lot/kartu stok tidak perlu aktivitas audit atau tombol edit yang tidak sesuai fungsinya.
- Halaman impor menyediakan breadcrumb kembali ke daftar atau record induk; input file mengikuti `FormSection` dan `FormField`.

Dashboard, visualisasi flow dokumen, dan layar scan menggunakan layout yang sesuai tugasnya. Ketiganya tetap memakai komponen UI bersama, tanpa dipaksakan menjadi halaman daftar atau form record.
