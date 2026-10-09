// Pola ILIKE "mengandung kata". Karakter % dan _ dari input user di-escape,
// supaya dicari apa adanya, bukan sebagai wildcard.
export function containsPattern(search: string) {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`
}
