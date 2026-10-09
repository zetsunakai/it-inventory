import { z } from "zod"

import { checkbox, optionalText, requiredText } from "./form-fields"
import { digitsOnly, headOfficeNitku, npwp16 } from "./npwp"

// Partner: vendor dan customer (PRD bagian 5.1). Dipakai sebagai entitas
// Pemasok/Penjual/Pembeli/Penerima di dokumen BC.

export const IDENTITY_TYPES = ["npwp16", "npwp15", "passport", "ktp", "other"] as const
export type IdentityType = (typeof IDENTITY_TYPES)[number]

export const IDENTITY_TYPE_LABELS: Record<IdentityType, string> = {
  npwp16: "NPWP 16 digit",
  npwp15: "NPWP 15 digit",
  passport: "Paspor",
  ktp: "KTP",
  other: "Lainnya",
}

// Kode jenis identitas di CEISA (kodeJenisIdentitas), sama dengan modul Odoo lama.
export const IDENTITY_TYPE_CEISA_CODES: Record<IdentityType, string> = {
  npwp16: "6",
  npwp15: "5",
  passport: "2",
  ktp: "3",
  other: "4",
}

export const NPWP_IDENTITY_TYPES: readonly IdentityType[] = ["npwp16", "npwp15"]

// Pola nomor per jenis identitas (dipaksakan juga di database). Nomor NPWP dan KTP disimpan
// angkanya saja; paspor dan lainnya apa adanya.
const IDENTITY_RULES: Record<IdentityType, { pattern: RegExp; message: string; digits: boolean }> =
  {
    npwp16: { pattern: /^\d{16}$/, message: "NPWP harus 16 digit.", digits: true },
    npwp15: { pattern: /^\d{15}$/, message: "NPWP harus 15 digit.", digits: true },
    ktp: { pattern: /^\d{16}$/, message: "Nomor KTP (NIK) harus 16 digit.", digits: true },
    passport: {
      pattern: /^[A-Z0-9]{5,20}$/,
      message: "Nomor paspor harus 5–20 huruf atau angka.",
      digits: false,
    },
    other: {
      pattern: /^.{1,50}$/,
      message: "Nomor identitas maksimal 50 karakter.",
      digits: false,
    },
  }

// NITKU partner: hanya untuk NPWP. Kosong = kantor pusat (NPWP 16 digit + 000000);
// NITKU cabang boleh diisi asal diawali NPWP 16 digit partner.
export function partnerNitku(type: IdentityType, identityNumber: string, nitku: string) {
  if (!NPWP_IDENTITY_TYPES.includes(type)) return null
  return digitsOnly(nitku) || headOfficeNitku(identityNumber)
}

// Nomor identitas yang disimpan: NPWP dan KTP angkanya saja, paspor huruf besar tanpa spasi.
function normalizeIdentityNumber(type: IdentityType, value: string) {
  if (IDENTITY_RULES[type].digits) return digitsOnly(value)
  if (type === "passport") return value.toUpperCase().replace(/\s/g, "")
  return value
}

// Pemeriksaan lintas field. Dijalankan walaupun field lain gagal validasi (when: selalu), supaya
// semua kesalahan tampil sekaligus; karena itu nilainya diperiksa tipenya lebih dulu.
function partnerIssues(input: Record<string, unknown>) {
  const issues: { path: string[]; message: string }[] = []
  if (input.isVendor !== true && input.isCustomer !== true) {
    issues.push({ path: ["isVendor"], message: "Pilih minimal satu peran: vendor atau customer." })
  }
  const type = IDENTITY_TYPES.find((value) => value === input.identityType)
  if (!type || typeof input.identityNumber !== "string" || !input.identityNumber) return issues

  const identityNumber = normalizeIdentityNumber(type, input.identityNumber)
  const rule = IDENTITY_RULES[type]
  if (!rule.pattern.test(identityNumber)) {
    issues.push({ path: ["identityNumber"], message: rule.message })
    return issues
  }
  const typed = typeof input.nitku === "string" ? input.nitku : ""
  const nitku = partnerNitku(type, identityNumber, typed)
  const base = npwp16(identityNumber)
  if (nitku && (!/^\d{22}$/.test(nitku) || (base && !nitku.startsWith(base)))) {
    issues.push({
      path: ["nitku"],
      message: "NITKU harus 22 digit dan diawali NPWP 16 digit partner.",
    })
  }
  if (!nitku && typed) {
    issues.push({ path: ["nitku"], message: "NITKU hanya untuk partner dengan identitas NPWP." })
  }
  return issues
}

export const partnerFieldsSchema = z
  .object({
    name: requiredText("Nama partner", 200),
    address: requiredText("Alamat", 500),
    countryCode: z.string().trim().min(1, "Negara wajib dipilih."),
    isVendor: checkbox,
    isCustomer: checkbox,
    identityType: z.enum(IDENTITY_TYPES, "Jenis identitas wajib dipilih."),
    identityNumber: requiredText("Nomor identitas", 50),
    nitku: optionalText("NITKU", 30).transform((value) => value ?? ""),
  })
  .superRefine(
    (input, ctx) => {
      for (const issue of partnerIssues(input)) ctx.addIssue({ code: "custom", ...issue })
    },
    { when: () => true },
  )
  .transform((input) => {
    const identityNumber = normalizeIdentityNumber(input.identityType, input.identityNumber)
    return {
      ...input,
      identityNumber,
      nitku: partnerNitku(input.identityType, identityNumber, input.nitku),
    }
  })

export type PartnerFields = z.output<typeof partnerFieldsSchema>

// Partner sebagai entitas dokumen BC (pemasok, penjual, pembeli, penerima). Untuk NPWP nomor
// identitas memakai NITKU, sesuai aturan CEISA; jenis lain memakai nomornya sendiri.
export type PartnerCustomsParty = {
  name: string
  address: string
  countryCode: string
  identityType: string
  identityNumber: string
}

export function partnerAsCustomsParty(
  partner: Pick<
    PartnerFields,
    "name" | "address" | "countryCode" | "identityType" | "identityNumber" | "nitku"
  >,
): PartnerCustomsParty {
  return {
    name: partner.name,
    address: partner.address,
    countryCode: partner.countryCode,
    identityType: IDENTITY_TYPE_CEISA_CODES[partner.identityType],
    identityNumber: partner.nitku ?? partner.identityNumber,
  }
}
