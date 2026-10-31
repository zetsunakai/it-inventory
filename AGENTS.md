<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Preferensi pengujian

- Keputusan user 29/10/2026: jangan menjalankan tes E2E/browser (termasuk untuk screenshot)
  sebelum akan commit dan push, kecuali user secara eksplisit memintanya.
- Selama implementasi biasa, gunakan lint, TypeScript, serta tes unit/database yang relevan.

## Alur kerja agent: branch baru + PR

Berlaku untuk semua agent, termasuk yang dikendalikan lewat Telegram
(`docs/telegram-agent.md`).

- Sebelum mengubah kode, pastikan `main` terbaru (`git fetch origin`, `git switch main`,
  `git pull --ff-only`) lalu buat branch baru: `git switch -c agent/<slug-singkat>`.
  Slug huruf kecil dan tanda hubung, mis. `agent/perbaikan-validasi-npwp`.
- Satu tugas satu branch. Jangan menumpuk tugas yang tidak berhubungan di satu branch.
- Jangan pernah commit atau push langsung ke `main`/`master`. Hook
  `scripts/git-hooks/pre-push` menolak push ke branch itu; aktifkan dengan
  `git config core.hooksPath scripts/git-hooks`.
- Sebelum commit jalankan `npm run check` (lint, typecheck, format). Jalankan tes unit/database
  yang relevan. Tes E2E hanya sebelum commit dan push, sesuai bagian di atas.
- Push branch lalu buka PR ke `main`:
  `git push -u origin agent/<slug>` dan
  `gh pr create --base main --head agent/<slug> --title "<ringkas>" --body "<ringkasan + cara tes>"`.
  Kalau `gh` belum login, laporkan ke user, jangan mencoba kredensial lain.
- Isi body PR: ringkasan perubahan, alasan, cara mengetes, dan risiko. PR harus bisa direview
  tanpa membuka chat.
- Jangan merge PR, jangan mengaktifkan auto-merge, dan jangan menandai PR siap merge. Merge
  adalah keputusan user.
- Jangan pernah menjalankan `git push --force`, `git reset --hard`, atau `git clean` pada
  perubahan yang bukan milik agent. Perubahan user yang belum di-commit tidak boleh dibuang.
- Jangan membaca atau menulis file `.env*` (selain `.env.example`) dan jangan menyalin rahasia
  ke kode, commit, atau pesan.
