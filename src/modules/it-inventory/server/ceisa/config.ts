import type { CeisaEnvironment } from "@/modules/it-inventory/lib/ceisa"

// Host resmi CEISA (sama dengan Equip3-moduleboard, core/equip3_manuf_ceisa/models/endpoints.py).
export const CEISA_HOSTS: Record<CeisaEnvironment, string> = {
  development: "https://apisdev-gw.beacukai.go.id",
  production: "https://apis-gw.beacukai.go.id",
}

// Alur login perusahaan Equip3 memakai path ini (data/ir_config_parameter.xml:
// ceisa.login.path.api.url). endpoints.py memuat path lain untuk akun partner
// (/auth-amws/v1/user/login); yang dipakai di sini adalah login akun perusahaan.
export const CEISA_LOGIN_PATH = "/nle-oauth/v1/user/login"

export const CEISA_REQUEST_TIMEOUT_MS = 20_000

export type CeisaConfig = {
  environment: CeisaEnvironment
  username: string
  password: string
  configured: boolean
}

// Nilai dari pengaturan database; tidak membaca environment server.
export function readCeisaConfig(value: unknown): Pick<CeisaConfig, "environment"> {
  const environment: CeisaEnvironment = value === "production" ? "production" : "development"
  return { environment }
}
