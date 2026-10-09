// Pola ILIKE dari input user. Karakter % dan _ di-escape supaya dicari apa adanya,
// bukan sebagai wildcard.
function escapeLike(search: string) {
  return search.replace(/[\\%_]/g, "\\$&")
}

// "Mengandung kata".
export function containsPattern(search: string) {
  return `%${escapeLike(search)}%`
}

// "Diawali kata".
export function prefixPattern(search: string) {
  return `${escapeLike(search)}%`
}
