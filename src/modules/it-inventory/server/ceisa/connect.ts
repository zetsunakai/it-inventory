import type { CeisaOutcome } from "@/modules/it-inventory/lib/ceisa"

import { CEISA_HOSTS, CEISA_LOGIN_PATH, CEISA_REQUEST_TIMEOUT_MS, type CeisaConfig } from "./config"

export type CeisaLoginResult = {
  outcome: CeisaOutcome
  message: string
  httpStatus: number | null
  authenticatedAt: Date | null
  accessToken: string | null
  refreshToken: string | null
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null
}

function hasLoginError(body: JsonObject | null) {
  if (!body) return false
  if (body.errors) return true
  if (typeof body.Exception === "string" && body.Exception.trim()) return true
  const status = typeof body.status === "string" ? body.status.toLowerCase() : ""
  return status.includes("login error") || status.includes("error")
}

function networkOutcome(error: unknown): { outcome: CeisaOutcome; message: string } {
  const name = error instanceof Error ? error.name : ""
  if (name === "TimeoutError" || name === "AbortError") {
    return {
      outcome: "timeout",
      message: `CEISA tidak merespons dalam ${CEISA_REQUEST_TIMEOUT_MS / 1000} detik. Coba lagi.`,
    }
  }
  return {
    outcome: "unreachable",
    message: "Tidak dapat menghubungi layanan CEISA. Periksa koneksi server lalu coba lagi.",
  }
}

// Autentikasi akun perusahaan CEISA. Fungsi ini hanya berjalan di server; token yang
// dikembalikan dipakai action untuk disimpan terenkripsi, tidak pernah ke browser.
export async function connectToCeisa(
  config: CeisaConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CeisaLoginResult> {
  const empty = {
    httpStatus: null,
    authenticatedAt: null,
    accessToken: null,
    refreshToken: null,
  } as const

  let response: Response
  try {
    response = await fetchImpl(`${CEISA_HOSTS[config.environment]}${CEISA_LOGIN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "it-inventory",
      },
      body: JSON.stringify({ username: config.username, password: config.password }),
      signal: AbortSignal.timeout(CEISA_REQUEST_TIMEOUT_MS),
      cache: "no-store",
    })
  } catch (error) {
    return { ...empty, ...networkOutcome(error) }
  }

  const httpStatus = response.status
  const text = await response.text().catch(() => "")
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  const body = asObject(parsed)

  if (httpStatus === 401) {
    return {
      ...empty,
      outcome: "authentication_failed",
      httpStatus,
      message:
        "Autentikasi CEISA ditolak. Periksa username, password, dan kesesuaian lingkungan akun (development/production).",
    }
  }
  if (httpStatus === 403) {
    return {
      ...empty,
      outcome: "forbidden",
      httpStatus,
      message: "Akun CEISA tidak punya akses ke layanan ini. Periksa kewenangan akun.",
    }
  }
  if (httpStatus >= 500) {
    return {
      ...empty,
      outcome: "server_error",
      httpStatus,
      message: `Layanan CEISA mengembalikan status ${httpStatus}. Coba lagi nanti.`,
    }
  }
  if (!response.ok) {
    return {
      ...empty,
      outcome: "invalid_response",
      httpStatus,
      // Jangan meneruskan pesan mentah yang bisa menggemakan kredensial/token.
      message: `CEISA menolak permintaan (status ${httpStatus}). Periksa konfigurasi integrasi.`,
    }
  }

  const item = asObject(body?.item)
  const accessToken = typeof item?.access_token === "string" ? item.access_token : ""
  const refreshToken = typeof item?.refresh_token === "string" ? item.refresh_token : ""

  if (hasLoginError(body)) {
    return {
      ...empty,
      outcome: "authentication_failed",
      httpStatus,
      message: "Username atau password CEISA salah.",
    }
  }
  if (!accessToken) {
    return {
      ...empty,
      outcome: "invalid_response",
      httpStatus,
      message: "Respons CEISA tidak memuat token akses.",
    }
  }

  return {
    outcome: "connected",
    httpStatus,
    message: "Autentikasi CEISA berhasil dan token akses tersimpan.",
    authenticatedAt: new Date(),
    accessToken,
    refreshToken: refreshToken || null,
  }
}
