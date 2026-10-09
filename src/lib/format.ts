// Format tampilan sesuai PRD bagian 11: zona waktu Asia/Jakarta,
// tanggal DD/MM/YYYY, angka format Indonesia.

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const numberFormat = new Intl.NumberFormat("id-ID")

export function formatDate(value: Date) {
  return dateFormat.format(value)
}

export function formatNumber(value: number) {
  return numberFormat.format(value)
}
