import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  customsAttentionItems,
  customsExceptions,
} from "@/modules/it-inventory/server/queries/customs-exceptions"
import { db } from "@/server/db"
import {
  company,
  customsDocumentLines,
  customsDocuments,
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertTestCompany,
  purgeCustomsDocuments,
  registerDocument,
} from "./customs-fixtures"
import { purgeInventory, withLine } from "./helpers"

// Laporan pengecualian dokumen BC (backlog M4-06, PRD 8.6). Koneksi tes mematikan gerbang, jadi
// transfer bisa Selesai tanpa dokumen seperti transfer lama sebelum M4.

const ids = { product: "", unit: "", vendor: "", rack: "", partner: "" }

beforeAll(async () => {
  await insertTestCompany(db)
  await db.transaction(async (tx) => {
    ids.product = await insertCustomsProduct(tx, "ZXP1")
  })
  const [unit] = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "ZXP1U"))
  ids.unit = unit.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZXW", name: "ZXW", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZXVEND", name: "Vendor", type: "vendor" },
      { code: "ZXRAK", name: "Rak", type: "internal", warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      name: "ZX Vendor",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZX-1",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await purgeCustomsDocuments(db)
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZX%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZX%"))
  await db.delete(products).where(like(products.sku, "ZXP%"))
  await db.delete(uoms).where(like(uoms.code, "ZXP%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZXP%"))
  await db.delete(company)
  await db.$client.end()
})

async function doneReceipt(qty: string, documentId?: string) {
  const [transfer] = await db
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
      customsDocumentId: documentId,
    })
    .returning({ id: transfers.id })
  const move = await withLine(db, {
    transferId: transfer.id,
    productId: ids.product,
    inputQty: qty,
    inputUomId: ids.unit,
  })
  await db
    .insert(stockMoves)
    .values({ ...move, sourceLocationId: ids.vendor, destinationLocationId: ids.rack })
  await db.execute(sql`select validate_transfer(${transfer.id})`)
  return transfer.id
}

async function registered(code: "23" | "40") {
  return db.transaction(async (tx) => {
    const doc = await insertCompleteDocument(tx, code, ids.product)
    await registerDocument(tx, doc.id, doc.ajuDate)
    return doc
  })
}

describe("customsExceptions", () => {
  test("transfer Selesai tanpa dokumen tercatat", async () => {
    const id = await doneReceipt("5")
    const { undocumented } = await customsExceptions()
    expect(undocumented.map((row) => row.id)).toContain(id)
  })

  test("selisih qty dokumen vs transfer muncul dan hilang setelah transfer berikutnya Selesai", async () => {
    const doc = await registered("23")
    await doneReceipt("60", doc.id)
    const gap = (await customsExceptions()).gaps.filter((row) => row.documentId === doc.id)
    expect(gap).toEqual([
      expect.objectContaining({ sku: "ZXP1", documentQty: "100.0000", doneQty: "60.0000" }),
    ])
    await doneReceipt("40", doc.id)
    expect((await customsExceptions()).gaps.map((row) => row.documentId)).not.toContain(doc.id)
  })

  test("dokumen Terdaftar lebih dari 7 hari tanpa transfer Selesai", async () => {
    const doc = await registered("40")
    // Tanggal daftar tidak boleh sebelum tanggal aju; untuk data uji trigger dimatikan sementara.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`)
      await tx
        .update(customsDocuments)
        .set({ registrationDate: sql`(now() at time zone 'Asia/Jakarta')::date - 10` })
        .where(eq(customsDocuments.id, doc.id))
    })
    const idle = (await customsExceptions()).idle.find((row) => row.id === doc.id)
    expect(idle?.days).toBe(10)
    await doneReceipt("100", doc.id)
    expect((await customsExceptions()).idle.map((row) => row.id)).not.toContain(doc.id)
  })

  test("saldo asal hampir habis (sisa ≤ 10%)", async () => {
    const origin = await registered("23")
    const [originLine] = await db
      .select({ id: customsDocumentLines.id })
      .from(customsDocumentLines)
      .where(eq(customsDocumentLines.documentId, origin.id))
    await db.transaction(async (tx) => {
      const out = await insertCompleteDocument(tx, "25", ids.product)
      const [line] = await tx
        .select({ id: customsDocumentLines.id })
        .from(customsDocumentLines)
        .where(eq(customsDocumentLines.documentId, out.id))
      await tx.execute(
        sql`select allocate_origin(${line.id}, ${JSON.stringify([
          { origin_line_id: originLine.id, qty: "95" },
        ])}::jsonb)`,
      )
    })
    const low = (await customsExceptions()).low.find((row) => row.documentId === origin.id)
    expect(low).toMatchObject({ seq: 1, remaining: "5.0000" })
  })

  test("ringkasan Beranda hanya untuk peran dengan bc:read", async () => {
    const items = await customsAttentionItems({ roles: ["staf_exim"] })
    expect(items.map((item) => item.href)).toEqual(
      expect.arrayContaining(["/dokumen-bc/pengecualian#tanpa-dokumen"]),
    )
    expect(await customsAttentionItems({ roles: ["admin_gudang"] })).toEqual([])
  })
})
