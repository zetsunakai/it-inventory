// Nilai yang dipakai bersama oleh konfigurasi Better Auth (server)
// dan proxy.ts. Jangan taruh rahasia di sini.
export const AUTH_COOKIE_PREFIX = "it-inventory"

export const LOGIN_PATH = "/login"
// Langkah kedua login untuk user yang sudah mengaktifkan MFA.
export const MFA_VERIFY_PATH = "/login/verifikasi"
// Halaman wajib aktivasi MFA untuk peran yang mengharuskannya.
export const MFA_SETUP_PATH = "/akun/mfa"

// Cegah open redirect: hanya path internal yang diizinkan.
export function safeRedirectPath(next: string | null | undefined) {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next
  return "/"
}
