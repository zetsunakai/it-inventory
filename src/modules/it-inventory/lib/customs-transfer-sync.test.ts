import { describe, expect, test } from "vitest"

import { emptyLine, syncTransferLines, type CustomsTransferProduct } from "./customs-form"

// Barang dari transfer yang dipilih (sync_inventory_transfer_product_lines hmx, H-04).

const KAIN: CustomsTransferProduct = {
  productId: "p-kain",
  sku: "KAIN",
  name: "Kain katun",
  hsCode: "52081100",
  qty: "100.0000",
}
const BENANG: CustomsTransferProduct = {
  productId: "p-benang",
  sku: "BNG",
  name: "Benang",
  hsCode: "52051100",
  qty: "12.5000",
}

describe("syncTransferLines", () => {
  test("baris kosong diganti barang dari transfer", () => {
    const lines = syncTransferLines([emptyLine()], [KAIN, BENANG])
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      productId: "p-kain",
      product: { id: "p-kain", sku: "KAIN", name: "Kain katun" },
      itemCode: "KAIN",
      hsCode: "52081100",
      description: "Kain katun",
      qty: "100",
      stockQty: "100",
    })
    expect(lines[1]).toMatchObject({ productId: "p-benang", qty: "12.5", stockQty: "12.5" })
  })

  test("memilih ulang tidak membuat baris ganda; isian lain dan produk lain tetap", () => {
    const first = syncTransferLines([emptyLine()], [KAIN])
    const edited = [
      { ...first[0], brand: "Merek A", description: "Kain katun putih" },
      { ...emptyLine(), productId: "p-lain", qty: "3" },
    ]
    const again = syncTransferLines(edited, [{ ...KAIN, qty: "150" }])
    expect(again).toHaveLength(2)
    expect(again[0]).toMatchObject({
      productId: "p-kain",
      brand: "Merek A",
      description: "Kain katun putih",
      qty: "150",
      stockQty: "150",
    })
    expect(again[1]).toMatchObject({ productId: "p-lain", qty: "3" })
  })

  test("tanpa barang dari transfer, baris tidak berubah", () => {
    const lines = [emptyLine()]
    expect(syncTransferLines(lines, [])).toBe(lines)
  })
})
