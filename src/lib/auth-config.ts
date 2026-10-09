// Nilai yang dipakai bersama oleh konfigurasi Better Auth (server)
// dan proxy.ts. Jangan taruh rahasia di sini.
export const AUTH_COOKIE_PREFIX = "it-inventory"

export const LOGIN_PATH = "/login"
// Langkah kedua login untuk user yang sudah mengaktifkan MFA.
export const MFA_VERIFY_PATH = "/login/verifikasi"
// Halaman wajib aktivasi MFA untuk peran yang mengharuskannya.
export const MFA_SETUP_PATH = "/akun/mfa"

// Cegah open redirect: hanya path internal yang diizinkan. "//host" dan "/\host"
// ditolak karena browser membacanya sebagai alamat situs lain.
export function safeRedirectPath(next: string | null | undefined) {
  if (next && next.startsWith("/") && next[1] !== "/" && next[1] !== "\\") return next
  return "/"
}
