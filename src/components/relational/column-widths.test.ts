import { describe, expect, test } from "vitest"
import { relationColumnWidths } from "./relational-utils"

describe("lebar kolom relasi", () => {
  test("kolom otomatis mengisi ruang tersisa dengan lebar yang sama", () => {
    const result = relationColumnWidths(["product", "qty", "uom", "lot"], 1432)
    expect(Object.values(result)).toEqual([300, 300, 300, 300])
    expect(Object.values(result).reduce((sum, width) => sum + width, 232)).toBe(1432)
  })
  test("resize satu kolom tetap dipertahankan; sisanya dibagi rata", () => {
    const result = relationColumnWidths(["product", "qty", "uom"], 1432, {
      product: 400,
      hidden: 900,
    })
    expect(result).toEqual({ product: 400, qty: 400, uom: 400 })
  })
  test("menyembunyikan kolom membagikan kembali ruang ke kolom terlihat", () => {
    expect(relationColumnWidths(["product", "qty"], 1432)).toEqual({ product: 600, qty: 600 })
  })
  test("pada layar kecil kolom tetap terbaca dan tabel dapat di-scroll", () => {
    expect(Object.values(relationColumnWidths(["a", "b", "c"], 390))).toEqual([200, 200, 200])
    expect(relationColumnWidths([], 0)).toEqual({})
  })
})
