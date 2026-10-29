// Istilah integrasi CEISA dipakai bersama server action dan komponen Pengaturan.
// Tidak berisi rahasia: kredensial dan host hanya dibaca di server.

export const CEISA_ENVIRONMENTS = ["development", "production"] as const
export type CeisaEnvironment = (typeof CEISA_ENVIRONMENTS)[number]

export const CEISA_ENVIRONMENT_LABELS: Record<CeisaEnvironment, string> = {
  development: "Development",
  production: "Production",
}

export const CEISA_OUTCOMES = [
  "connected",
  "authentication_failed",
  "forbidden",
  "misconfigured",
  "timeout",
  "unreachable",
  "invalid_response",
  "server_error",
] as const
export type CeisaOutcome = (typeof CEISA_OUTCOMES)[number]

export type CeisaOutcomeTone = "success" | "warning" | "danger" | "neutral"

// Judul pop-up. Pesan rinci tetap datang dari server supaya sesuai respons sebenarnya.
export const CEISA_OUTCOME_TITLES: Record<CeisaOutcome, string> = {
  connected: "Berhasil terhubung",
  authentication_failed: "Login CEISA ditolak",
  forbidden: "Akses CEISA ditolak",
  misconfigured: "Kredensial CEISA belum diatur",
  timeout: "CEISA tidak merespons",
  unreachable: "Tidak dapat menghubungi CEISA",
  invalid_response: "Respons CEISA tidak dikenali",
  server_error: "Layanan CEISA bermasalah",
}

export const CEISA_OUTCOME_TONES: Record<CeisaOutcome, CeisaOutcomeTone> = {
  connected: "success",
  authentication_failed: "danger",
  forbidden: "danger",
  misconfigured: "danger",
  timeout: "warning",
  unreachable: "warning",
  invalid_response: "warning",
  server_error: "warning",
}

// Hasil satu percobaan Connect. Token tidak pernah ikut ke browser.
export type CeisaConnectResult = {
  environment: CeisaEnvironment
  outcome: CeisaOutcome
  message: string
  httpStatus: number | null
  authenticatedAt: string | null
}
