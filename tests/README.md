# Aturan penempatan tes

Modul tes mengikuti modul aplikasi: `base`, `inventory`, dan `it-inventory`.
Folder `base` tetap datar; belum perlu subfolder per topik.

| Jenis                                  | Lokasi                                         |
| -------------------------------------- | ---------------------------------------------- |
| Unit                                   | `src/**/*.test.ts`, di sebelah kode yang dites |
| Database                               | `tests/db/<modul>/`                            |
| E2E                                    | `tests/e2e/<modul>/`                           |
| Setup dan helper lintas modul          | `tests/shared/`                                |
| Fixture khusus satu modul              | Bersama tes modul yang memakainya              |
| Tes lintas modul atau komponen bersama | `tests/db/base/` atau `tests/e2e/base/`        |

`tests/shared/` tidak berisi suite `.test.ts` atau `.spec.ts`. File
`shared/e2e/admin.setup.ts` adalah setup autentikasi Playwright, bukan suite fitur.
Tes konfigurasi ESLint tetap di `scripts/eslint-boundaries.test.mjs` dan dijalankan
oleh `npm run lint`, bukan Vitest.

## Menjalankan tes

```bash
npm test                                              # seluruh unit dan database
npm test -- --project unit src/modules/inventory/      # unit satu modul
npm test -- --project db tests/db/inventory/            # database satu modul
npm run test:e2e -- tests/e2e/it-inventory/              # E2E satu modul + setup MFA
npx playwright test --list                             # discovery tanpa browser
```

Ganti nama folder untuk modul lain. Unit base mengikuti lokasi kode yang dites,
misalnya `npm test -- --project unit src/lib/`.

Tes database dan E2E membuat ulang database khusus tes; jangan arahkan
`TEST_DATABASE_URL` ke database development atau production.

Sesuai aturan repo, jangan jalankan E2E/browser selama implementasi biasa kecuali
diminta eksplisit; jalankan ketika akan commit dan push. Discovery `--list` tidak
menjalankan browser. Gunakan lint, TypeScript, dan tes unit/database selama implementasi.

## Kapan menambah subfolder

Pertimbangkan subfolder per topik jika satu folder modul sudah sulit dinavigasi
(sekitar 25 file atau lebih), atau satu topik memiliki beberapa suite yang sering
dijalankan terpisah. Jumlah file bukan alasan otomatis untuk memecah folder;
utamakan kejelasan kepemilikan tes dan kebutuhan nyata.
