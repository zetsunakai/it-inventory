#!/usr/bin/env bash
# Menyiapkan agent OpenCode yang bisa dikendalikan lewat Telegram.
# Hanya memeriksa prasyarat, memasang bot, dan mengaktifkan hook git.
# Token Telegram dan password OpenCode TIDAK ditulis oleh script ini; isi lewat
# wizard `opencode-telegram config` atau ~/.config/opencode-telegram-bot/.env.
#
# Pemakaian:
#   ./scripts/setup-telegram-agent.sh          # cek prasyarat + pasang bot
#   ./scripts/setup-telegram-agent.sh --check  # cek prasyarat saja

set -euo pipefail

check_only=false
if [[ "${1:-}" == "--check" ]]; then
  check_only=true
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "Jalankan script ini di dalam clone repo it-inventory." >&2
  exit 1
fi
cd "$repo_root"

problems=0
note() { printf '%s\n' "$1"; }
fail() {
  printf '  [x] %s\n' "$1" >&2
  problems=$((problems + 1))
}
ok() { printf '  [v] %s\n' "$1"; }

note "Memeriksa prasyarat agent Telegram..."

# Node 22.14+ dibutuhkan bot; repo memakai Node 24 (lihat .nvmrc).
if command -v node >/dev/null 2>&1; then
  node_version="$(node -v | sed 's/^v//')"
  node_major="${node_version%%.*}"
  if ((node_major >= 22)); then
    ok "Node $node_version"
  else
    fail "Node $node_version terlalu tua (butuh 22.14+; repo memakai Node 24)."
  fi
else
  fail "Node.js belum terpasang. Install Node 24 (lihat .nvmrc)."
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm -v)"
else
  fail "npm belum terpasang."
fi

if command -v opencode >/dev/null 2>&1; then
  ok "OpenCode $(opencode --version 2>/dev/null | head -n 1)"
else
  fail "OpenCode belum terpasang: https://opencode.ai"
fi

if [[ -d node_modules ]]; then
  ok "node_modules ada"
else
  fail "node_modules belum ada. Jalankan: npm install"
fi

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    ok "GitHub CLI sudah login"
  else
    fail "GitHub CLI belum login. Jalankan: gh auth login --hostname github.com --git-protocol https --web"
  fi
else
  fail "GitHub CLI (gh) belum terpasang. Tanpa gh, PR harus dibuat manual."
fi

if [[ -f scripts/git-hooks/pre-push ]]; then
  git config core.hooksPath scripts/git-hooks
  ok "Hook git aktif (push ke main diblokir)"
else
  fail "scripts/git-hooks/pre-push tidak ditemukan."
fi

if ((problems > 0)); then
  printf '\n%d prasyarat belum beres. Perbaiki dulu, lalu jalankan ulang script ini.\n' "$problems" >&2
  exit 1
fi

if [[ "$check_only" == true ]]; then
  printf '\nSemua prasyarat beres.\n'
  exit 0
fi

if command -v opencode-telegram >/dev/null 2>&1; then
  ok "Bot opencode-telegram sudah terpasang"
else
  note "Memasang @grinev/opencode-telegram-bot..."
  npm install -g @grinev/opencode-telegram-bot
  ok "Bot terpasang"
fi

cat <<'EOF'

Langkah manual berikutnya (rahasia diisi sendiri, jangan lewat script):

1. Buat bot di @BotFather, simpan token.
2. Ambil Telegram User ID dari @userinfobot.
3. Nyalakan server OpenCode V2 dan ambil passwordnya:
     opencode service start
     opencode service get password
4. Jalankan wizard bot:
     opencode-telegram config
   Jawaban yang disarankan:
     bahasa            : id
     versi OpenCode    : v2
     URL server        : http://127.0.0.1:49374
     username          : opencode
     password          : (hasil langkah 3)
     model provider    : opencode
     model id          : glm-5.3-flash-free
5. Jalankan bot di background:
     opencode-telegram start --daemon
6. Buka bot di Telegram, kirim /status lalu /projects.

Panduan lengkap: docs/telegram-agent.md
EOF
