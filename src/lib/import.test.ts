import { describe, expect, test } from "vitest"

import { matchOption, normalizeHeader, optionList, parseFlag } from "./import"
import { INVENTORY_CATEGORY_LABELS } from "./inventory"

describe("parseFlag", () => {
  test("Ya/Tidak dan variasinya, kosong memakai nilai default", () => {
    for (const value of ["Ya", "ya", " Y ", "1", "true", "x"])
      expect(parseFlag(value, false)).toBe(true)
    for (const value of ["Tidak", "TIDAK", "n", "0", "false"])
      expect(parseFlag(value, true)).toBe(false)
    expect(parseFlag("", true)).toBe(true)
    expect(parseFlag("  ", false)).toBe(false)
  })

  test("nilai lain tidak dikenali", () => {
    expect(parseFlag("mungkin", false)).toBeUndefined()
  })
})

describe("matchOption", () => {
  test("cocok lewat label atau kode, tanpa beda huruf besar/kecil", () => {
    expect(matchOption("Bahan baku", INVENTORY_CATEGORY_LABELS)).toBe("raw_material")
    expect(matchOption("  barang   JADI ", INVENTORY_CATEGORY_LABELS)).toBe("finished_good")
    expect(matchOption("wip", INVENTORY_CATEGORY_LABELS)).toBe("wip")
    expect(matchOption("raw_material", INVENTORY_CATEGORY_LABELS)).toBe("raw_material")
    expect(matchOption("Bahan", INVENTORY_CATEGORY_LABELS)).toBeUndefined()
  })
})

test("judul kolom dinormalisasi: tanda *, spasi, huruf besar", () => {
  expect(normalizeHeader(" Kode  HS* ")).toBe("kode hs")
})

test("optionList menulis daftar pilihan untuk pesan", () => {
  expect(optionList({ a: "Satu", b: "Dua", c: "Tiga" })).toBe("Satu, Dua, atau Tiga")
  expect(optionList({ a: "Satu" })).toBe("Satu")
})
