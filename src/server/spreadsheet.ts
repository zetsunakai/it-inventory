import "server-only"

import { parse } from "csv-parse/sync"
import { stringify } from "csv-stringify/sync"
import ExcelJS from "exceljs"

import { AppError } from "@/server/actions/app-error"

// Baca dan tulis file Excel (.xlsx) dan CSV untuk import/export master data (backlog M1-07).
// Semua nilai dibaca sebagai teks; arti tiap kolom ditentukan oleh modul import masing-masing.

export const SPREADSHEET_FORMATS = ["xlsx", "csv"] as const
export type SpreadsheetFormat = (typeof SPREADSHEET_FORMATS)[number]

// Batas supaya satu import tidak menahan server terlalu lama. 5.000 produk dalam Excel
// sekitar 300 KB, dalam CSV sekitar 800 KB. bodySizeLimit server action di next.config.ts
// harus sedikit di atas MAX_IMPORT_BYTES.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 20_000

export type SheetRow = {
  // Nomor baris di file (baris 1 = judul kolom), untuk laporan kesalahan.
  line: number
  cells: string[]
}

export type Sheet = { headers: string[]; rows: SheetRow[] }

export async function readSpreadsheet(file: File): Promise<Sheet> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new AppError(`Ukuran file maksimal ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`)
  }
  const format = formatOf(file.name)
  if (!format) throw new AppError("Format file harus Excel (.xlsx) atau CSV (.csv).")

  const buffer = await file.arrayBuffer()
  const lines = format === "xlsx" ? await readExcel(buffer) : readCsv(buffer)
  const [header, ...rows] = lines.filter((row) => row.cells.some(Boolean))
  if (!header || rows.length === 0) throw new AppError("File tidak berisi data.")
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      `File berisi ${rows.length} baris, maksimal ${MAX_IMPORT_ROWS} baris per import.`,
    )
  }
  return { headers: header.cells, rows }
}

function formatOf(fileName: string): SpreadsheetFormat | undefined {
  const extension = fileName.toLowerCase().split(".").pop()
  return SPREADSHEET_FORMATS.find((format) => format === extension)
}

async function readExcel(buffer: ArrayBuffer): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new AppError("File Excel tidak bisa dibaca. Simpan ulang sebagai .xlsx lalu coba lagi.")
  }
  // Sheet pertama saja, sama dengan file hasil export.
  const sheet = workbook.worksheets[0]
  if (!sheet) throw new AppError("File tidak berisi data.")

  const rows: SheetRow[] = []
  sheet.eachRow((row, line) => {
    // row.values dimulai dari indeks 1 (kolom A).
    const values = Array.isArray(row.values) ? row.values.slice(1) : []
    rows.push({ line, cells: Array.from(values, (value) => cellText(value)) })
  })
  return rows
}

// Nilai sel Excel sebagai teks. Angka ditulis tanpa pemisah ribuan dan tanpa notasi ilmiah.
export function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return numberText(value)
  if (typeof value === "boolean") return value ? "Ya" : "Tidak"
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if ("richText" in value)
    return value.richText
      .map((part) => part.text)
      .join("")
      .trim()
  if ("error" in value) return ""
  // Rumus: pakai hasil terakhir yang tersimpan di file.
  if ("formula" in value || "sharedFormula" in value) {
    return cellText(value.result as ExcelJS.CellValue | undefined)
  }
  if ("text" in value) return String(value.text).trim()
  return ""
}

function numberText(value: number) {
  const text = String(value)
  if (!/e/i.test(text)) return text
  return value.toFixed(10).replace(/\.?0+$/, "")
}

function readCsv(buffer: ArrayBuffer): SheetRow[] {
  const text = new TextDecoder("utf-8").decode(buffer)
  try {
    const records = parse(text, {
      // Excel berbahasa Indonesia menyimpan CSV dengan titik koma.
      delimiter: detectDelimiter(text),
      bom: true,
      info: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    }) as unknown as { record: string[]; info: { lines: number } }[]
    return records.map(({ record, info }) => ({ line: info.lines, cells: record }))
  } catch (error) {
    const line = (error as { lines?: number }).lines
    throw new AppError(
      line
        ? `File CSV tidak bisa dibaca di baris ${line}. Periksa tanda kutip di baris itu.`
        : "File CSV tidak bisa dibaca.",
    )
  }
}

// Pemisah kolom dari baris judul: titik koma atau koma, mana yang lebih banyak.
export function detectDelimiter(text: string) {
  const header = text.slice(0, text.search(/\r?\n|$/))
  const count = (character: string) => header.split(character).length - 1
  return count(";") > count(",") ? ";" : ","
}

export type SheetColumn = { header: string; width: number }

// Semua nilai ditulis sebagai teks: kode HS, NPWP, dan SKU tidak kehilangan angka 0 di depan,
// dan desimal tidak dibulatkan oleh Excel. File ini bisa langsung diisi lalu di-import lagi.
export async function writeSpreadsheet(
  format: SpreadsheetFormat,
  sheetName: string,
  columns: SheetColumn[],
  rows: string[][],
): Promise<Uint8Array> {
  if (format === "csv") {
    // BOM supaya Excel membaca UTF-8 dengan benar.
    const csv = stringify([columns.map((column) => column.header), ...rows], { bom: true })
    return new TextEncoder().encode(csv)
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] })
  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: { numFmt: "@" },
  }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRows(rows)
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

const CONTENT_TYPES: Record<SpreadsheetFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
}

// Respons unduhan untuk route handler export. Nama file berisi tanggal hari ini (WIB).
export function spreadsheetResponse(format: SpreadsheetFormat, name: string, body: Uint8Array) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${name}-${today}.${format}"`,
      "Cache-Control": "no-store",
    },
  })
}
