import ExcelJS from "exceljs"
import { describe, expect, test } from "vitest"

import { AppError } from "@/server/actions/app-error"

import {
  cellText,
  detectDelimiter,
  MAX_IMPORT_ROWS,
  readSpreadsheet,
  writeSpreadsheet,
} from "./spreadsheet"

function csvFile(text: string, name = "data.csv") {
  return new File([text], name, { type: "text/csv" })
}

async function errorsOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    if (error instanceof AppError) return error.errors
    throw error
  }
  throw new Error("Seharusnya gagal.")
}

describe("readSpreadsheet: CSV", () => {
  test("koma atau titik koma, BOM, baris kosong dilewati, nomor baris sesuai file", async () => {
    const sheet = await readSpreadsheet(csvFile('﻿SKU;Nama\r\n\r\nA1;"Baut; mur"\r\nB2; Dua \r\n'))
    expect(sheet.headers).toEqual(["SKU", "Nama"])
    expect(sheet.rows).toEqual([
      { line: 3, cells: ["A1", "Baut; mur"] },
      { line: 4, cells: ["B2", "Dua"] },
    ])

    const comma = await readSpreadsheet(csvFile("SKU,Nama\nA1,Satu\n"))
    expect(comma.rows[0].cells).toEqual(["A1", "Satu"])
  })

  test("pemisah ditentukan dari baris judul", () => {
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";")
    expect(detectDelimiter("a,b\n1;2")).toBe(",")
  })

  test("file tanpa data, format lain, dan kutip rusak ditolak dengan pesan jelas", async () => {
    expect(await errorsOf(readSpreadsheet(csvFile("SKU,Nama\n")))).toEqual([
      "File tidak berisi data.",
    ])
    expect(await errorsOf(readSpreadsheet(csvFile("x", "data.xls")))).toEqual([
      "Format file harus Excel (.xlsx) atau CSV (.csv).",
    ])
    expect(await errorsOf(readSpreadsheet(csvFile('SKU\n"A1\nB2\n')))).toEqual([
      expect.stringContaining("File CSV tidak bisa dibaca"),
    ])
  })

  test(`maksimal ${MAX_IMPORT_ROWS} baris`, async () => {
    const text = ["SKU", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `S${i}`)].join(
      "\n",
    )
    expect(await errorsOf(readSpreadsheet(csvFile(text)))).toEqual([
      expect.stringContaining(`maksimal ${MAX_IMPORT_ROWS} baris`),
    ])
  })
})

describe("Excel", () => {
  test("hasil writeSpreadsheet terbaca ulang apa adanya, termasuk angka 0 di depan", async () => {
    const columns = [
      { header: "Kode HS", width: 10 },
      { header: "Nama", width: 20 },
    ]
    const body = await writeSpreadsheet("xlsx", "Produk", columns, [
      ["01012100", "Kuda"],
      ["84713000", ""],
    ])
    const sheet = await readSpreadsheet(new File([body as BlobPart], "produk.xlsx"))
    expect(sheet.headers).toEqual(["Kode HS", "Nama"])
    expect(sheet.rows).toEqual([
      { line: 2, cells: ["01012100", "Kuda"] },
      { line: 3, cells: ["84713000", ""] },
    ])
  })

  test("sel angka, rumus, teks kaya, dan tanggal dibaca sebagai teks", () => {
    expect(cellText(1.5)).toBe("1.5")
    expect(cellText(0.0000001)).toBe("0.0000001")
    expect(cellText(1234567890123)).toBe("1234567890123")
    expect(cellText({ formula: "A1*2", result: 4 } as ExcelJS.CellValue)).toBe("4")
    expect(cellText({ richText: [{ text: "Ba" }, { text: "ut " }] })).toBe("Baut")
    expect(cellText(new Date("2026-10-13T00:00:00Z"))).toBe("2026-10-13")
    expect(cellText(null)).toBe("")
  })

  test("file .xlsx yang rusak ditolak", async () => {
    expect(await errorsOf(readSpreadsheet(new File(["bukan excel"], "x.xlsx")))).toEqual([
      expect.stringContaining("File Excel tidak bisa dibaca"),
    ])
  })
})

test("CSV hasil export memakai BOM dan koma", async () => {
  const body = await writeSpreadsheet("csv", "P", [{ header: "Nama", width: 1 }], [["Baut, mur"]])
  expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(body)).toBe('﻿Nama\n"Baut, mur"\n')
})
