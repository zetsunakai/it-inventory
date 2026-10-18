import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import type { Role } from "@/lib/permissions"
import {
  allocateOrigins,
  createCustomsDocumentFromTransfer,
  linkTransferCustomsDocument,
  suggestOriginAllocations,
} from "@/modules/it-inventory/actions/customs-transfers"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"
import { getCustomsDocument } from "@/modules/it-inventory/server/queries/customs-documents"
import {
  getDocumentAllocations,
  getDocumentTransfers,
  getTransferCustoms,
  searchLinkableCustomsDocuments,
  searchOriginOptions,
} from "@/modules/it-inventory/server/queries/customs-transfers"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  company,
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

// Buat dokumen BC dari transfer dan tautkan transfer ke dokumen (backlog M4-04).

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "Staf Exim",
    email: "exim@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
}

const ids = { product: "", unit: "", vendor: "", rack: "", partner: "", receipt: "" }

beforeAll(async () => {
  await insertTestCompany(db)
  await db.transaction(async (tx) => {
    ids.product = await insertCustomsProduct(tx, "ZTP1")
  })
  const [unit] = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "ZTP1U"))
  ids.unit = unit.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZTW", name: "ZTW", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZTVEND", name: "Vendor", type: "vendor" },
      { code: "ZTRAK", name: "Rak", type: "internal", warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      name: "ZT Supplier Ltd",
      address: "Shanghai",
      countryCode: "CN",
      identityType: "other",
      identityNumber: "ZT-1",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  ids.receipt = await newReceipt()
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await purgeCustomsDocuments(db)
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZT%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZT%"))
  await db.delete(products).where(like(products.sku, "ZTP%"))
  await db.delete(uoms).where(like(uoms.code, "ZTP%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZTP%"))
  await db.delete(company)
  await db.$client.end()
})

async function newReceipt() {
  const [transfer] = await db
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
    })
    .returning({ id: transfers.id })
  const move = await withLine(db, {
    transferId: transfer.id,
    productId: ids.product,
    inputQty: "25",
    inputUomId: ids.unit,
  })
  await db
    .insert(stockMoves)
    .values({ ...move, sourceLocationId: ids.vendor, destinationLocationId: ids.rack })
  return transfer.id
}

describe("createCustomsDocumentFromTransfer", () => {
  test("dokumen terisi dari transfer, ditautkan, dan baris move menunjuk baris dokumen", async () => {
    loginAs(["staf_exim"])
    const result = await createCustomsDocumentFromTransfer({
      transferId: ids.receipt,
      docCode: "23",
    })
    if (!result.ok) throw new Error(result.errors.join("\n"))
    expect(result.data.path).toBe(`/dokumen-bc/bc23/${result.data.id}`)

    const doc = await getCustomsDocument(BC23, result.data.id)
    expect(doc?.status).toBe("draft")
    expect(doc?.draft.parties.map((party) => party.entityTypeCode)).toEqual(["3", "7", "5"])
    expect(doc?.draft.parties[2]).toMatchObject({ name: "ZT Supplier Ltd", countryCode: "CN" })
    expect(doc?.draft.header.signerName).toBe("Staf Exim")
    expect(doc?.draft.lines).toHaveLength(1)
    expect(doc?.draft.lines[0]).toMatchObject({
      stockQty: "25",
      hsCode: "52081100",
      description: "Kain katun",
    })

    const customs = await getTransferCustoms(ids.receipt)
    expect(customs?.document?.id).toBe(result.data.id)
    expect(customs?.quantities).toEqual([
      expect.objectContaining({ sku: "ZTP1", documentQty: "25.0000", transferQty: "25.0000" }),
    ])
    const [move] = await db
      .select({ lineId: stockMoves.customsDocumentLineId })
      .from(stockMoves)
      .where(eq(stockMoves.transferId, ids.receipt))
    expect(move.lineId).not.toBeNull()

    // Jenis yang sama membuka dokumen yang ada; jenis lain ditolak.
    const again = await createCustomsDocumentFromTransfer({
      transferId: ids.receipt,
      docCode: "23",
    })
    expect(again).toMatchObject({ ok: true, data: { id: result.data.id } })
    const other = await createCustomsDocumentFromTransfer({
      transferId: ids.receipt,
      docCode: "40",
    })
    expect(other).toMatchObject({
      ok: false,
      errors: [expect.stringMatching(/sudah ditautkan ke BC 2\.3 .* Lepas dulu tautannya\./)],
    })
  })

  test("penerimaan tidak bisa memakai dokumen keluar; hanya peran bc:write", async () => {
    loginAs(["admin_gudang"])
    expect(
      await createCustomsDocumentFromTransfer({ transferId: ids.receipt, docCode: "23" }),
    ).toMatchObject({ ok: false, errors: ["Anda tidak punya izin untuk melakukan aksi ini."] })

    loginAs(["staf_exim"])
    const receipt = await newReceipt()
    const result = await createCustomsDocumentFromTransfer({ transferId: receipt, docCode: "25" })
    expect(result).toMatchObject({ ok: false })
    if (result.ok) return
    expect(result.errors[0]).toMatch(/tidak bisa memakai BC 2\.5/)
  })
})

describe("linkTransferCustomsDocument", () => {
  test("lepas lalu tautkan ke dokumen yang sudah ada lewat pencarian", async () => {
    loginAs(["staf_exim"])
    const receipt = await newReceipt()
    const created = await createCustomsDocumentFromTransfer({ transferId: receipt, docCode: "40" })
    if (!created.ok) throw new Error(created.errors.join("\n"))

    expect(
      await linkTransferCustomsDocument({ transferId: receipt, documentId: null }),
    ).toMatchObject({ ok: true })
    expect((await getTransferCustoms(receipt))?.document).toBeNull()

    const found = await searchLinkableCustomsDocuments(receipt, "")
    expect(found.map((doc) => doc.id)).toContain(created.data.id)
    expect(
      await linkTransferCustomsDocument({ transferId: receipt, documentId: created.data.id }),
    ).toMatchObject({ ok: true })
    expect((await getTransferCustoms(receipt))?.document?.id).toBe(created.data.id)
  })
})

describe("sisi dokumen (M4-05)", () => {
  test("transfer tertaut dan qty per produk: dokumen, Selesai, berjalan", async () => {
    loginAs(["staf_exim"])
    const receipt = await newReceipt()
    const created = await createCustomsDocumentFromTransfer({ transferId: receipt, docCode: "23" })
    if (!created.ok) throw new Error(created.errors.join("\n"))
    const second = await newReceipt()
    await linkTransferCustomsDocument({ transferId: second, documentId: created.data.id })
    // Koneksi tes mematikan gerbang, jadi penerimaan pertama bisa langsung Selesai.
    await db.execute(sql`select validate_transfer(${receipt})`)

    const { transfers: linked, quantities } = await getDocumentTransfers(created.data.id)
    expect(linked.map((row) => [row.id, row.status])).toEqual([
      [receipt, "done"],
      [second, "draft"],
    ])
    expect(quantities).toEqual([
      expect.objectContaining({
        sku: "ZTP1",
        documentQty: "25.0000",
        doneQty: "25.0000",
        openQty: "25.0000",
      }),
    ])
  })

  test("alokasi asal: pilihan saldo, saran FIFO, simpan lewat aksi", async () => {
    loginAs(["staf_exim"])
    const { origin, out } = await db.transaction(async (tx) => {
      const origin = await insertCompleteDocument(tx, "23", ids.product)
      await registerDocument(tx, origin.id, origin.ajuDate)
      const out = await insertCompleteDocument(tx, "25", ids.product)
      return { origin, out }
    })
    const [line] = await getDocumentAllocations(out.id)
    expect(line.allocations).toHaveLength(1)

    const options = await searchOriginOptions(line.lineId, origin.ajuNumber)
    expect(options).toEqual([
      expect.objectContaining({ ajuNumber: origin.ajuNumber, available: "100.0000" }),
    ])
    const suggested = await suggestOriginAllocations({ lineId: line.lineId })
    expect(suggested).toMatchObject({ ok: true })

    const saved = await allocateOrigins({
      lineId: line.lineId,
      allocations: [{ originLineId: options[0].lineId, qty: "100" }],
    })
    expect(saved).toMatchObject({ ok: true })
    const [after] = await getDocumentAllocations(out.id)
    expect(after.allocations.map((row) => [row.ajuNumber, row.qty])).toEqual([
      [origin.ajuNumber, "100.0000"],
    ])
    const over = await allocateOrigins({
      lineId: line.lineId,
      allocations: [{ originLineId: options[0].lineId, qty: "150" }],
    })
    expect(over).toMatchObject({
      ok: false,
      errors: ["Total alokasi 150 melebihi qty barang seri 1 (100)."],
    })
  })
})
