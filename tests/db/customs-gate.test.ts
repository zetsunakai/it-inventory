import { eq, sql } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import { MOVEMENT_CODES } from "@/modules/inventory/lib/inventory"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_MOVEMENT_DOC_CODES,
  CUSTOMS_ORIGIN_DOC_CODES,
} from "@/modules/it-inventory/lib/customs"
import { createDb } from "@/server/db/client"
import {
  customsDocumentLines,
  customsDocuments,
  locations,
  partners,
  stockMoves,
  transfers,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../test-env"
import { insertCompleteDocument, insertCustomsProduct, insertTestCompany } from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint, withLine } from "./helpers"

// Tautan dokumen BC ↔ transfer (M4-01) dan gerbang validasi (M4-02, PRD 8.4). Koneksi sendiri tanpa
// options app.customs_gate=off, jadi gerbang aktif seperti di aplikasi. Semua data di-rollback.

const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

async function setup(tx: Tx) {
  await insertTestCompany(tx)
  const productId = await insertCustomsProduct(tx, "ZGP1")
  const otherProductId = await insertCustomsProduct(tx, "ZGP2")
  const [unit] = await tx.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "ZGP1U"))
  const [warehouse] = await tx
    .insert(warehouses)
    .values({ code: "ZGW", name: "ZGW", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, customer, rack, bin] = await tx
    .insert(locations)
    .values([
      { code: "ZGVEND", name: "Vendor", type: "vendor" },
      { code: "ZGCUST", name: "Customer", type: "customer" },
      { code: "ZGRAK", name: "Rak", type: "internal", warehouseId: warehouse.id },
      { code: "ZGBIN", name: "Bin", type: "internal", warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  const [partner] = await tx
    .insert(partners)
    .values({
      name: "ZG Partner",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZG-1",
    })
    .returning({ id: partners.id })
  return {
    productId,
    otherProductId,
    unitId: unit.id,
    vendor: vendor.id,
    customer: customer.id,
    rack: rack.id,
    bin: bin.id,
    partner: partner.id,
  }
}

type Setup = Awaited<ReturnType<typeof setup>>

// Penerimaan Draft berisi satu baris barang, opsional ditautkan ke dokumen.
async function receipt(
  tx: Tx,
  s: Setup,
  qty: string,
  options: { documentId?: string; productId?: string } = {},
) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: s.vendor,
      destinationLocationId: s.rack,
      partnerId: s.partner,
      customsDocumentId: options.documentId,
    })
    .returning()
  const productId = options.productId ?? s.productId
  const move = await withLine(tx, {
    transferId: transfer.id,
    productId,
    inputQty: qty,
    inputUomId: productId === s.productId ? s.unitId : await unitOf(tx, productId),
  })
  await tx.insert(stockMoves).values({
    ...move,
    sourceLocationId: s.vendor,
    destinationLocationId: s.rack,
  })
  return transfer
}

async function unitOf(tx: Tx, productId: string) {
  const { rows } = await tx.execute<{ uom_id: string }>(
    sql`select uom_id from products where id = ${productId}`,
  )
  return rows[0].uom_id
}

async function registeredDocument(tx: Tx, code: "23" | "40" | "25", productId: string) {
  const doc = await insertCompleteDocument(tx, code, productId)
  await tx.execute(sql`select refresh_customs_document_status(${doc.id})`)
  await tx.execute(sql`select submit_customs_document(${doc.id})`)
  await tx.execute(sql`select register_customs_document(${doc.id}, '000999', ${doc.ajuDate}::date)`)
  return doc
}

const validate = (tx: Tx, id: string) =>
  pgErrorInSavepoint(tx, (sp) => sp.execute(sql`select validate_transfer(${id})`))

describe("tautan dokumen ↔ transfer (M4-01)", () => {
  test("jenis dokumen harus cocok dengan arah; transfer lain tidak bisa ditautkan", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const outgoing = await registeredDocument(tx, "25", s.productId)
      expect(
        await pgErrorInSavepoint(tx, (sp) => receipt(sp, s, "1", { documentId: outgoing.id })),
      ).toBe("Dokumen BC 2.5 tidak cocok untuk penerimaan; pilih BC 2.3 atau BC 4.0.")

      const incoming = await registeredDocument(tx, "23", s.productId)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.insert(transfers).values({
            type: "internal",
            sourceLocationId: s.rack,
            destinationLocationId: s.bin,
            customsDocumentId: incoming.id,
          }),
        ),
      ).toMatch(/tidak memakai dokumen BC/)
    })
  })

  test("baris move otomatis ke baris dokumen per produk, hanya ke dokumen transfernya; ganti dokumen menautkan ulang", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const doc = await registeredDocument(tx, "23", s.productId)
      const other = await registeredDocument(tx, "40", s.productId)
      const transfer = await receipt(tx, s, "10", { documentId: doc.id })
      const [line] = await tx
        .select({ id: customsDocumentLines.id })
        .from(customsDocumentLines)
        .where(eq(customsDocumentLines.documentId, doc.id))
      const [otherLine] = await tx
        .select({ id: customsDocumentLines.id })
        .from(customsDocumentLines)
        .where(eq(customsDocumentLines.documentId, other.id))

      // Move baru di transfer bertaut langsung menunjuk baris dokumen produknya.
      const [linked] = await tx
        .select({ lineId: stockMoves.customsDocumentLineId })
        .from(stockMoves)
        .where(eq(stockMoves.transferId, transfer.id))
      expect(linked.lineId).toBe(line.id)

      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(stockMoves)
            .set({ customsDocumentLineId: otherLine.id })
            .where(eq(stockMoves.transferId, transfer.id)),
        ),
      ).toBe("Baris dokumen BC harus milik dokumen yang ditautkan ke transfernya.")

      await tx
        .update(stockMoves)
        .set({ customsDocumentLineId: line.id })
        .where(eq(stockMoves.transferId, transfer.id))
      await tx
        .update(transfers)
        .set({ customsDocumentId: other.id })
        .where(eq(transfers.id, transfer.id))
      const [move] = await tx
        .select({ lineId: stockMoves.customsDocumentLineId })
        .from(stockMoves)
        .where(eq(stockMoves.transferId, transfer.id))
      expect(move.lineId).toBe(otherLine.id)
    })
  })

  test("transfer lanjutan (backorder) mewarisi dokumen transfer asal", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const doc = await registeredDocument(tx, "23", s.productId)
      const origin = await receipt(tx, s, "10", { documentId: doc.id })
      const [backorder] = await tx
        .insert(transfers)
        .values({
          type: "receipt",
          sourceLocationId: s.vendor,
          destinationLocationId: s.rack,
          partnerId: s.partner,
          backorderOfId: origin.id,
        })
        .returning()
      expect(backorder.customsDocumentId).toBe(doc.id)
    })
  })
})

describe("gerbang validasi (M4-02)", () => {
  test("penerimaan tanpa dokumen atau dengan dokumen belum Terdaftar ditolak", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const plain = await receipt(tx, s, "5")
      expect(await validate(tx, plain.id)).toBe(
        `Transfer ${plain.number} belum ditautkan ke dokumen BC (BC 2.3 atau BC 4.0).`,
      )

      const draft = await insertCompleteDocument(tx, "23", s.productId)
      const linked = await receipt(tx, s, "5", { documentId: draft.id })
      expect(await validate(tx, linked.id)).toBe(
        `Dokumen BC 2.3 ${draft.ajuNumber} masih Draft; transfer baru bisa Selesai setelah dokumen Terdaftar.`,
      )
    })
  })

  test("parsial boleh sampai qty dokumen; kelebihan dan produk di luar dokumen ditolak per produk", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      // Dokumen lengkap dari fixture: 100 dalam satuan stok.
      const doc = await registeredDocument(tx, "23", s.productId)
      const first = await receipt(tx, s, "60", { documentId: doc.id })
      await tx.execute(sql`select validate_transfer(${first.id})`)

      const over = await receipt(tx, s, "50", { documentId: doc.id })
      expect(await validate(tx, over.id)).toBe(
        "Produk ZGP1: qty transfer 50 melebihi sisa dokumen 40 (qty dokumen 100, sudah Selesai 60).",
      )
      const wrongProduct = await receipt(tx, s, "1", {
        documentId: doc.id,
        productId: s.otherProductId,
      })
      expect(await validate(tx, wrongProduct.id)).toBe(
        `Produk ZGP2 tidak ada di dokumen BC 2.3 ${doc.ajuNumber}.`,
      )

      const rest = await receipt(tx, s, "40", { documentId: doc.id })
      await tx.execute(sql`select validate_transfer(${rest.id})`)
      const [done] = await tx
        .select({ status: transfers.status })
        .from(transfers)
        .where(eq(transfers.id, rest.id))
      expect(done.status).toBe("done")
    })
  })

  test("dokumen yang direvisi menahan transfer yang belum Selesai", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const doc = await registeredDocument(tx, "23", s.productId)
      const transfer = await receipt(tx, s, "10", { documentId: doc.id })
      await tx.execute(sql`select revise_customs_document(${doc.id}, 'Koreksi berat')`)
      const [revised] = await tx
        .select({ status: customsDocuments.status })
        .from(customsDocuments)
        .where(eq(customsDocuments.id, doc.id))
      expect(await validate(tx, transfer.id)).toBe(
        `Dokumen BC 2.3 ${doc.ajuNumber} masih ${revised.status === "ready" ? "Siap ajukan" : "Draft"}; transfer baru bisa Selesai setelah dokumen Terdaftar.`,
      )
    })
  })

  test("transfer tanpa kewajiban dokumen (pindah lokasi) tidak terkena gerbang", async () => {
    await inRollback(db, async (tx) => {
      const s = await setup(tx)
      const doc = await registeredDocument(tx, "23", s.productId)
      const stocked = await receipt(tx, s, "5", { documentId: doc.id })
      await tx.execute(sql`select validate_transfer(${stocked.id})`)
      const [internal] = await tx
        .insert(transfers)
        .values({ type: "internal", sourceLocationId: s.rack, destinationLocationId: s.bin })
        .returning()
      const move = await withLine(tx, {
        transferId: internal.id,
        productId: s.productId,
        inputQty: "2",
        inputUomId: s.unitId,
      })
      await tx
        .insert(stockMoves)
        .values({ ...move, sourceLocationId: s.rack, destinationLocationId: s.bin })
      await tx.execute(sql`select validate_transfer(${internal.id})`)
    })
  })
})

describe("pemetaan per kode pergerakan dan jenis dokumen", () => {
  test.each(MOVEMENT_CODES)(
    "kode %s: jenis dokumen sama dengan konstanta aplikasi",
    async (code) => {
      const { rows } = await db.execute<{ codes: string[] }>(
        sql`select customs_movement_doc_codes(${code}::movement_code)::text[] as codes`,
      )
      expect(rows[0].codes).toEqual([...(CUSTOMS_MOVEMENT_DOC_CODES[code] ?? [])])
    },
  )

  test.each(CUSTOMS_DOC_CODES)(
    "BC %s: jenis dokumen asal sama dengan konstanta aplikasi",
    async (code) => {
      const { rows } = await db.execute<{ codes: string[] }>(
        sql`select customs_origin_doc_codes(${code}::customs_doc_code)::text[] as codes`,
      )
      expect(rows[0].codes).toEqual([...(CUSTOMS_ORIGIN_DOC_CODES[code] ?? [])])
    },
  )
})
