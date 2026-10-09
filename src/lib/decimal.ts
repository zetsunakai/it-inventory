// Angka desimal sebagai string, tanpa float (PRD bagian 13.1): disimpan di kolom numeric
// dan dihitung di database. Dipakai untuk faktor konversi, nanti juga qty dan nilai uang.

// Input user: koma atau titik sebagai pemisah desimal, tanpa pemisah ribuan.
// "0,001" → "0.001". null bila bukan angka positif dengan maksimal `scale` desimal.
export function parseDecimalInput(input: string, scale: number): string | null {
  const value = input.trim().replace(",", ".")
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`)
  if (!pattern.test(value)) return null
  const [integer, fraction = ""] = value.split(".")
  const normalized = `${integer.replace(/^0+(?=\d)/, "")}${fraction ? `.${fraction}` : ""}`
  return /[1-9]/.test(normalized) ? normalized : null
}

// Tampilan format Indonesia dari string numeric Postgres: "1000.5000000000" → "1.000,5".
export function formatDecimal(value: string) {
  const [integer, fraction = ""] = value.split(".")
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  const trimmed = fraction.replace(/0+$/, "")
  return trimmed ? `${grouped},${trimmed}` : grouped
}

// Nilai awal field input: tanpa pemisah ribuan supaya terbaca ulang oleh parseDecimalInput.
// "1000.0000000000" → "1000", "0.0010000000" → "0,001".
export function toDecimalInput(value: string) {
  const [integer, fraction = ""] = value.split(".")
  const trimmed = fraction.replace(/0+$/, "")
  return trimmed ? `${integer},${trimmed}` : integer
}
