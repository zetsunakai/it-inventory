// Import master data dari Excel/CSV (backlog M1-07): tipe hasil dan aturan membaca nilai sel.
// Dipakai bersama oleh server (modul import) dan UI (hasil import).
//
// Aturan import:
// - Baris dicocokkan lewat kode (SKU untuk produk). Kode baru = data baru, kode yang sudah ada =
//   data diperbarui. Kolom yang tidak ada di file tidak mengubah data tersimpan.
// - Semua baris divalidasi dulu. Bila ada satu saja yang salah, tidak ada yang disimpan dan
//   semua kesalahan dilaporkan per baris.

export type ImportRowError = {
  // Nomor baris di file, sama dengan nomor baris di Excel.
  line: number
  // Kode/SKU di baris itu, supaya mudah dicari.
  key: string
  messages: string[]
}

export type ImportResult =
  | { status: "invalid"; total: number; errors: ImportRowError[] }
  | { status: "imported"; total: number; created: number; updated: number; unchanged: number }

// Kolom yang bisa diisi di file import. key dipakai kode, header dipakai di file.
export type ImportColumn<Key extends string = string> = {
  key: Key
  header: string
  // Lebar kolom di file Excel hasil export.
  width: number
  // Petunjuk isi kolom di halaman import.
  description: string
  // "always" = wajib di setiap baris, "new" = wajib untuk data baru saja.
  required?: "always" | "new"
}

export const FLAG_TRUE = "Ya"
export const FLAG_FALSE = "Tidak"

export function flagText(value: boolean) {
  return value ? FLAG_TRUE : FLAG_FALSE
}

const TRUE_VALUES = new Set(["ya", "y", "yes", "true", "1", "x"])
const FALSE_VALUES = new Set(["tidak", "t", "no", "n", "false", "0"])

// "Ya"/"Tidak" (juga 1/0, true/false, x). Kosong = nilai `blank`. undefined = tidak dikenali.
export function parseFlag(value: string, blank: boolean): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return blank
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return undefined
}

// Pilihan tetap (kategori, tipe lokasi, jenis identitas) boleh ditulis sebagai label
// ("Bahan baku") atau kodenya ("raw_material"), huruf besar/kecil tidak berpengaruh.
export function matchOption<Code extends string>(
  value: string,
  labels: Record<Code, string>,
): Code | undefined {
  const normalized = normalizeHeader(value)
  return (Object.keys(labels) as Code[]).find(
    (code) => normalizeHeader(code) === normalized || normalizeHeader(labels[code]) === normalized,
  )
}

// Judul kolom dibandingkan tanpa beda huruf besar/kecil, spasi ganda, dan tanda * (penanda
// kolom wajib yang sering ditambahkan sendiri oleh user).
export function normalizeHeader(value: string) {
  return value.replace(/\*/g, "").trim().replace(/\s+/g, " ").toLowerCase()
}

// Daftar pilihan untuk pesan kesalahan: "Bahan baku, WIP, atau Barang jadi".
export function optionList(labels: Record<string, string>) {
  const values = Object.values(labels)
  if (values.length < 2) return values.join("")
  return `${values.slice(0, -1).join(", ")}, atau ${values.at(-1)}`
}
