# Agent Telegram

Panduan menjalankan agent OpenCode di laptop dan mengendalikannya lewat chat Telegram.
App tetap di-deploy dari Vercel; agent hanya mengubah kode, membuat branch, lalu membuka PR ke
`main`.

```
HP (Telegram) -> bot opencode-telegram -> OpenCode (agent) -> branch agent/<slug>
                                                              -> PR ke main
                                                              -> merge -> Vercel deploy
```

Bot yang dipakai: [`@grinev/opencode-telegram-bot`](https://github.com/grinev/opencode-telegram-bot)
(MIT). Bot berjalan lokal dan hanya menghubungi Telegram Bot API serta server OpenCode lokal, jadi
tidak ada port yang dibuka ke internet.

## Prasyarat

- Node.js 22.14+ (repo ini memakai Node 24, lihat `.nvmrc`).
- OpenCode sudah terpasang (`opencode --version`).
- GitHub CLI (`gh`) sudah login, supaya agent bisa membuat PR.
- Clone repo ini di laptop dan `npm install` sudah dijalankan.

## 1. Siapkan repo dan pagar keamanan

```bash
nvm install && nvm use        # Node 24
npm install
git config core.hooksPath scripts/git-hooks   # push ke main diblokir
```

Hook `scripts/git-hooks/pre-push` menolak push ke `main`/`master` dari clone ini. Aturan branch dan
PR untuk agent ada di `AGENTS.md` (bagian "Alur kerja agent: branch baru + PR"), dan pagar perintah
berisiko ada di `opencode.jsonc` (push minta persetujuan, force push dan `sudo` diblokir).

Login GitHub sekali:

```bash
gh auth login --hostname github.com --git-protocol https --web
gh auth status
```

Tanpa `gh`, agent masih bisa push branch tetapi PR harus dibuat manual lewat link yang diberikan.

## 2. Buat bot Telegram

1. Buka [@BotFather](https://t.me/BotFather), kirim `/newbot`, ikuti instruksinya.
2. Simpan **token** yang diberikan (bentuknya `123456:ABC-DEF...`).
3. Buka [@userinfobot](https://t.me/userinfobot), kirim pesan apa saja, catat **User ID** (angka).

Token dan User ID bersifat rahasia. Jangan commit ke repo.

## 3. Nyalakan server OpenCode (V2)

```bash
opencode service start
opencode service get password
```

Catat password yang muncul; bot membutuhkannya. Alamat default server V2 adalah
`http://127.0.0.1:49374`.

## 4. Pasang dan konfigurasi bot

Cara cepat:

```bash
./scripts/setup-telegram-agent.sh
```

Script memeriksa prasyarat, mengaktifkan hook git, dan memasang bot. Script **tidak** menulis token
atau password.

Konfigurasi lewat wizard:

```bash
opencode-telegram config
```

Jawaban yang disarankan:

| Pertanyaan      | Jawaban                               |
| --------------- | ------------------------------------- |
| Bahasa          | `id`                                  |
| Versi OpenCode  | `v2`                                  |
| URL server      | `http://127.0.0.1:49374`              |
| Username server | `opencode`                            |
| Password server | hasil `opencode service get password` |
| Model provider  | `opencode`                            |
| Model ID        | `glm-5.3-flash-free`                  |

Konfigurasi tersimpan di `~/.config/opencode-telegram-bot/.env` (Linux). File itu berisi token;
jangan dibagikan.

### Model gratis

Model gratis yang tersedia lewat provider `opencode` antara lain:

- `glm-5.3-flash-free`
- `flint-40b-free`
- `mimo-v2.6-flash-free`
- `beam-free`
- `nemotron-3.5-super-vl-free`

Model gratis punya rate limit dan kualitas di bawah model berbayar. Untuk tugas besar, kerjakan
langsung di TUI OpenCode. Model bisa diganti dari chat lewat pemilih model di bot.

## 5. Jalankan bot

```bash
opencode-telegram start --daemon   # background
opencode-telegram status
```

Atau jalankan di foreground untuk melihat log:

```bash
opencode-telegram start
```

## 6. Tes dari Telegram

1. Buka bot, kirim `/status` (cek server dan model).
2. Kirim `/projects`, pilih folder repo `it-inventory`.
3. Kirim tugas percobaan, mis.
   `buat branch agent/coba-telegram, tambah file docs/coba.md berisi "tes", commit, push, lalu buat PR ke main`.
4. Saat agent menjalankan `git push`, bot menampilkan tombol persetujuan. Setujui hanya kalau branch
   yang dituju sudah benar (`agent/...`).
5. Buka PR di GitHub, review, lalu merge sendiri. Jangan minta agent merge.

## Alur kerja agent

- Agent selalu mulai dari `main` terbaru dan membuat branch `agent/<slug>`.
- Sebelum commit, agent menjalankan `npm run check`. Tes E2E hanya sebelum commit dan push.
- Agent membuka PR ke `main` dengan ringkasan perubahan dan cara mengetes.
- Merge tetap keputusan user. Merge ke `main` memicu deploy Vercel.
- `git push` selalu minta persetujuan di chat; force push diblokir.

## Keamanan

- `TELEGRAM_ALLOWED_USER_ID` adalah whitelist. Hanya User ID itu yang bisa menyuruh bot; pesan lain
  diabaikan dan dicatat.
- Jangan jalankan agent sebagai `root`. Cukup user biasa yang punya akses ke clone repo.
- Jangan simpan kredensial produksi (AWS, database produksi, token Vercel) di mesin yang menjalankan
  agent. Agent bisa menjalankan perintah shell.
- Port server OpenCode (49374/4096) jangan dibuka ke internet; cukup `127.0.0.1`.
- Kalau token bot bocor, revoke lewat BotFather lalu jalankan `opencode-telegram config` lagi.
- `.env*` selain `.env.example` tidak boleh dibaca atau ditulis agent.

## Troubleshooting

| Gejala                      | Penyebab dan solusi                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot diam saja               | Cek `opencode-telegram status`, log di `~/.config/opencode-telegram-bot/logs/`, dan pastikan server OpenCode hidup (`opencode service status`). |
| Pesan diabaikan             | `TELEGRAM_ALLOWED_USER_ID` bukan User ID lo. Ambil ulang dari @userinfobot.                                                                     |
| Error password/unauthorized | Password V2 salah atau berubah. Jalankan `opencode service get password`, perbarui config.                                                      |
| Model error / kosong        | Model ID salah atau kena rate limit. Ganti ke model gratis lain lewat pemilih model.                                                            |
| `Push ke main diblokir`     | Hook bekerja. Buat branch `agent/<slug>` dulu.                                                                                                  |
| `gh: not logged in`         | Jalankan `gh auth login` di mesin yang sama dengan bot.                                                                                         |
| Bot mati saat laptop tidur  | Wajar. Untuk selalu siap, pindahkan ke server yang menyala 24 jam (bagian berikut).                                                             |

## Pindah ke server yang menyala 24 jam

Konfigurasinya sama; bedanya hanya mesin. Pilihan gratis/murah:

- Oracle Cloud Always Free (ARM, permanen) — cocok untuk jangka panjang.
- AWS EC2 `t4g.small` — gratis 6 bulan dengan kredit akun baru, lalu berbayar.
- VPS kecil (±$4–6/bulan).

Di server Linux, jalankan bot lewat `systemd` (lihat
[`docs/LINUX_SYSTEMD_SETUP.md`](https://github.com/grinev/opencode-telegram-bot/blob/main/docs/LINUX_SYSTEMD_SETUP.md)
di repo bot) supaya otomatis hidup lagi setelah reboot. Clone repo dengan deploy key atau token
GitHub yang hanya punya akses ke repo ini, dan tetap aktifkan `core.hooksPath` serta `gh auth login`.
