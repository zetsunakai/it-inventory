import "server-only"

import { z } from "zod"

import {
  normalizeHeader,
  type ImportColumn,
  type ImportResult,
  type ImportRowError,
} from "@/lib/import"
import { AppError } from "@/server/actions/app-error"
import { readSpreadsheet, type SheetColumn } from "@/server/spreadsheet"

// Kerangka import/export master data (backlog M1-07). Tiap modul (produk, partner, lokasi)
// mendefinisikan kolomnya, cara mengubah baris jadi data, dan cara menyimpannya.

export type ImportRow<Key extends string> = {
  line: number
  // Hanya kolom yang ada di file. Kolom yang tidak ada tidak mengubah data tersimpan.
  values: Partial<Record<Key, string>>
}

// Input server action import: satu file dari <input type="file" name="file">.
export const importFileSchema = z.object({
  file: z
    .instanceof(File, { error: "Pilih file Excel atau CSV." })
    .refine((file) => file.size > 0, "Pilih file Excel atau CSV."),
})

export async function readImportFile<Key extends string>(
  file: File,
  columns: readonly ImportColumn<Key>[],
  keyColumn: Key,
): Promise<ImportRow<Key>[]> {
  const sheet = await readSpreadsheet(file)

  const byHeader = new Map<string, ImportColumn<Key>>()
  for (const column of columns) {
    byHeader.set(normalizeHeader(column.header), column)
    byHeader.set(normalizeHeader(column.key), column)
  }

  const positions: { index: number; key: Key }[] = []
  const unknown: string[] = []
  const seen = new Set<Key>()
  const errors: string[] = []
  sheet.headers.forEach((header, index) => {
    // Kolom tanpa judul (sering tersisa di Excel) diabaikan.
    if (!header.trim()) return
    const column = byHeader.get(normalizeHeader(header))
    if (!column) return void unknown.push(`"${header}"`)
    if (seen.has(column.key)) return void errors.push(`Kolom ${column.header} muncul dua kali.`)
    seen.add(column.key)
    positions.push({ index, key: column.key })
  })
  if (unknown.length) {
    errors.push(`Kolom tidak dikenal: ${unknown.join(", ")}. Gunakan judul kolom dari file export.`)
  }
  if (!seen.has(keyColumn)) {
    const header = columns.find((column) => column.key === keyColumn)?.header ?? keyColumn
    errors.push(`Kolom ${header} wajib ada.`)
  }
  if (errors.length) throw new AppError(errors)

  return sheet.rows.map((row) => {
    const values: Partial<Record<Key, string>> = {}
    for (const { index, key } of positions) values[key] = (row.cells[index] ?? "").trim()
    return { line: row.line, values }
  })
}

export function exportColumns(columns: readonly ImportColumn[]): SheetColumn[] {
  return columns.map(({ header, width }) => ({ header, width }))
}

// Pengumpul kesalahan per baris. Semua baris diperiksa, lalu semua kesalahan dilaporkan sekaligus.
export class RowErrors {
  private readonly errors: ImportRowError[] = []

  add(line: number, key: string, messages: string[]) {
    const unique = [...new Set(messages)]
    if (unique.length) this.errors.push({ line, key, messages: unique })
  }

  get count() {
    return this.errors.length
  }

  result(total: number): ImportResult {
    return { status: "invalid", total, errors: this.errors.sort((a, b) => a.line - b.line) }
  }
}

// Kode yang muncul lebih dari sekali di file: baris berikutnya dianggap salah.
export class DuplicateKeys {
  private readonly lines = new Map<string, number>()

  check(key: string, line: number, label: string): string | undefined {
    if (!key) return undefined
    const first = this.lines.get(key)
    if (first !== undefined) return `${label} ${key} sudah ada di baris ${first}.`
    this.lines.set(key, line)
    return undefined
  }
}

// Pesan dari schema, kecuali untuk kolom yang kesalahannya sudah dilaporkan dengan pesan yang
// lebih jelas (mis. kategori yang tidak dikenal, bukan "Kategori wajib dipilih").
export function issueMessages(error: z.ZodError, reported: ReadonlySet<string> = new Set()) {
  return error.issues
    .filter((issue) => !reported.has(String(issue.path[0])))
    .map((issue) => issue.message)
}

export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size))
  }
  return result
}

// Banyak baris per INSERT: jauh lebih cepat dari satu per satu, dan tetap di bawah batas
// 65.535 parameter Postgres untuk tabel dengan belasan kolom.
export const INSERT_BATCH_SIZE = 1000
