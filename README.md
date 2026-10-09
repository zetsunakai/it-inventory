# IT Inventory

Aplikasi IT Inventory untuk perusahaan Kawasan Berikat: mencatat pergerakan barang di gudang berikat
dan menghubungkannya dengan dokumen BC. Spesifikasi lengkap ada di PRD.

Stack: Next.js 16 (App Router, React, Tailwind CSS, shadcn/ui), PostgreSQL 16, Drizzle ORM,
Better Auth.

## Kebutuhan

- Node.js 22 atau lebih baru
- Docker dengan plugin Compose

## Menjalankan di lokal

```bash
npm install
cp .env.example .env.local
# isi BETTER_AUTH_SECRET (openssl rand -base64 32) dan SEED_ADMIN_PASSWORD di .env.local
npm run db:up        # Postgres 16 di Docker, port 5433
npm run db:migrate   # terapkan semua migrasi
npm run db:seed      # data awal + akun Administrator (aman dijalankan berulang)
npm run dev          # http://localhost:3000, otomatis menyalakan database
```

Login dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` dari `.env.local`. Sign-up publik
dimatikan: user baru dibuat oleh Administrator.

## Auth

- Better Auth, endpoint di `/api/auth/*`. Konfigurasi di `src/server/auth/index.ts`.
- Baca sesi hanya lewat `getSession()` / `requireUser()` di `src/server/auth/session.ts`, dan
  panggil dari komponen yang dibungkus `<Suspense>` (aturan `cacheComponents` di Next 16).
- `src/proxy.ts` hanya mengecek keberadaan cookie untuk redirect cepat ke `/login`. Validasi
  sesi yang sebenarnya tetap di server.
- Tabel auth (`users`, `sessions`, `accounts`, `verifications`) di
  `src/server/db/schema/auth.ts`. Kalau menambah plugin Better Auth, generate ulang dengan
  `npx auth@latest generate` lalu sesuaikan dengan konvensi repo.

## Script

| Script                                    | Fungsi                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                             | Server development (menyalakan database lebih dulu)  |
| `npm run lint` / `npm run typecheck`      | ESLint dan pengecekan TypeScript                     |
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
- Bagian yang membaca sesi atau `searchParams` dibungkus `<Suspense>`, supaya layout dan judul halaman
  ikut di-prerender (aturan `cacheComponents`).

## Referensi kepabeanan

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
- **End-to-end** (`tests/e2e/`): alur di browser. Akun tes dibuat oleh `tests/e2e/global-setup.ts`
  lewat script seed. `tests/e2e/admin.setup.ts` mengaktifkan MFA Administrator lewat UI (kode TOTP
  dihitung oleh `tests/e2e/totp.ts`) dan menyimpan sesinya; tes yang butuh Administrator memakai
  `test.use({ storageState: ADMIN_STATE_FILE })`.

Semua tes memakai database terpisah `it_inventory_test` di container yang sama, yang dikosongkan lalu
dimigrasi ulang setiap kali tes jalan. Database development tidak tersentuh. Ganti lewat env
`TEST_DATABASE_URL` bila perlu; namanya wajib berakhiran `_test`.

CI (`.github/workflows/ci.yml`) menjalankan lint, typecheck, format, `npm test`, dan `npm run test:e2e`
di setiap push dan pull request.

## Struktur folder

```
drizzle/                 migrasi SQL (hasil generate + file SQL kustom)
src/
  app/                   route Next.js (halaman, layout, route handler)
  app/(app)/             halaman setelah login (layout dengan sidebar)
  components/ui/         komponen shadcn/ui
  components/data-table/ tabel daftar dengan cari, filter, pagination di server
  components/            komponen bersama (sidebar, header halaman, placeholder modul)
  hooks/                 React hooks untuk client
  lib/                   utilitas yang aman dipakai di client maupun server
  server/                kode khusus server, tidak boleh diimpor dari client
    queries/             query baca per modul
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
- Jangan pernah mengubah database secara manual. Setiap tabel yang punya `updated_at` diberi trigger
  `set_updated_at()`.
