// Format tampilan sesuai PRD bagian 11: zona waktu Asia/Jakarta,
// tanggal DD/MM/YYYY, angka format Indonesia.

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

const numberFormat = new Intl.NumberFormat("id-ID")

export function formatDate(value: Date) {
  return dateFormat.format(value)
}

export function formatNumber(value: number) {
  return numberFormat.format(value)
}

// "13/10/2026 14.05" (WIB), mis. cut-off stock opname.
export function formatDateTime(value: Date) {
  return dateTimeFormat.format(value).replace(",", "")
}
