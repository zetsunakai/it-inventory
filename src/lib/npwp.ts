// NPWP dan NITKU (format DJP sejak 2024). Dipakai profil perusahaan (M1-02)
// dan partner (M1-06).
//
// - NPWP 16 digit: format baru. NPWP 15 digit lama = "0" + 15 digit.
// - NITKU 22 digit: NPWP 16 digit + 6 digit kode tempat kegiatan usaha (000000 = pusat).

export const HEAD_OFFICE_SUFFIX = "000000"

// "01.234.567.8-901.000" → "012345678901000"
export function digitsOnly(value: string) {
  return value.replace(/\D/g, "")
}

export function npwp16(npwp: string): string | null {
  const digits = digitsOnly(npwp)
  if (digits.length === 16) return digits
  if (digits.length === 15) return `0${digits}`
  return null
}

// NITKU kantor pusat dari NPWP 15 atau 16 digit.
export function headOfficeNitku(npwp: string): string | null {
  const base = npwp16(npwp)
  return base ? `${base}${HEAD_OFFICE_SUFFIX}` : null
}

// Kode jenis identitas CEISA untuk NPWP: 6 = NPWP 16 digit, 5 = NPWP 15 digit.
export function npwpIdentityType(npwp: string): "5" | "6" | null {
  const length = digitsOnly(npwp).length
  if (length === 16) return "6"
  if (length === 15) return "5"
  return null
}
