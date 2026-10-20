import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import {
  getDocumentTransfers,
  getTransferCustoms,
} from "@/modules/it-inventory/server/queries/customs-transfers"
import { db } from "@/server/db"
import {
  company,
  customsDocumentTransfers,
  locations,
  partners,
  products,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertSourceTransfer,
  insertTestCompany,
  purgeCustomsDocuments,
} from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint } from "./helpers"

// Inventory Transfer Documents mengikuti hmx (backlog H-01, PRD 8): dokumen memilih transfer Siap
// atau Selesai yang kode pergerakannya diizinkan jenis dokumen (DOCUMENT_SOURCE_MAP), dan
// validasi transfer tidak menunggu dokumen BC.

let product = ""

beforeAll(async () => {
  await insertTestCompany(db)
  await db.transaction(async (tx) => {
    product = await insertCustomsProduct(tx, "ZBT1")
  })
})

afterAll(async () => {
  await purgeCustomsDocuments(db)
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx.execute(sql`delete from stock_balances where product_id = ${product}`)
    await tx.execute(sql`
      delete from stock_moves where product_id = ${product}`)
    await tx.execute(sql`
      delete from transfers where id not in (select transfer_id from transfer_lines
        where product_id <> ${product})
        and id in (select transfer_id from transfer_lines where product_id = ${product})`)
    await tx.execute(sql`delete from transfer_lines where product_id = ${product}`)
  })
  await db.delete(partners).where(like(partners.code, "ZBP%"))
  await db.delete(locations).where(like(locations.code, "ZB%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZBW%"))
  await db.delete(products).where(like(products.sku, "ZBT%"))
  await db.delete(uoms).where(like(uoms.code, "ZBT%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZBT%"))
  await db.delete(company)
  await db.$client.end()
})

async function transferRow(id: string) {
  const [row] = await db
    .select({ number: transfers.number, status: transfers.status })
    .from(transfers)
    .where(eq(transfers.id, id))
  return row
}

describe("pilihan transfer", () => {
  test("dokumen memilih transfer; kedua sisi menampilkan tautannya", async () => {
    const { doc, receipt } = await db.transaction(async (tx) => {
      const doc = await insertCompleteDocument(tx, "23", product)
      const receipt = await insertSourceTransfer(tx, "23", product)
      await tx.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId: receipt })
      return { doc, receipt }
    })

    const rows = await getDocumentTransfers(doc.id)
    expect(rows).toEqual([
      expect.objectContaining({
        id: receipt,
        type: "receipt",
        movementCode: "gr",
        status: "ready",
      }),
    ])
    const customs = await getTransferCustoms(receipt)
    expect(customs?.allowed).toEqual(["23", "40", "20", "262", "27", "16", "33"])
    expect(customs?.documents).toEqual([
      expect.objectContaining({ id: doc.id, number: doc.number, ajuNumber: null }),
    ])

    // Satu transfer boleh dipilih beberapa dokumen.
    const other = await db.transaction(async (tx) => {
      const other = await insertCompleteDocument(tx, "40", product)
      await tx
        .insert(customsDocumentTransfers)
        .values({ documentId: other.id, transferId: receipt })
      return other
    })
    expect((await getTransferCustoms(receipt))?.documents.map((row) => row.id)).toEqual([
      doc.id,
      other.id,
    ])
  })

  test("transfer di luar sumber jenis dokumen atau belum Siap ditolak", async () => {
    await inRollback(db, async (tx) => {
      const doc = await insertCompleteDocument(tx, "23", product)
      const delivery = await insertSourceTransfer(tx, "25", product)
      const [row] = await tx
        .select({ number: transfers.number })
        .from(transfers)
        .where(eq(transfers.id, delivery))
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId: delivery }),
        ),
      ).toBe(
        `Dokumen BC 2.3 hanya dapat dikaitkan dengan sumber inventory yang diizinkan. Transfer tidak valid: ${row.number} (gi, Siap).`,
      )

      const receipt = await insertSourceTransfer(tx, "23", product)
      await tx.execute(sql`select reset_transfer_to_draft(${receipt})`)
      const [draft] = await tx
        .select({ number: transfers.number })
        .from(transfers)
        .where(eq(transfers.id, receipt))
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId: receipt }),
        ),
      ).toBe(
        `Dokumen BC 2.3 hanya dapat dikaitkan dengan sumber inventory yang diizinkan. Transfer tidak valid: ${draft.number} (gr, draft).`,
      )
    })
  })

  test("transfer yang sudah dipilih tetap bisa divalidasi; transfer tak dikenal tanpa panel", async () => {
    const receipt = await db.transaction((tx) => insertSourceTransfer(tx, "23", product))
    await db.execute(sql`select validate_transfer(${receipt})`)
    expect((await transferRow(receipt)).status).toBe("done")
    expect(await getTransferCustoms(crypto.randomUUID())).toBeNull()
  })
})

describe("tanpa gerbang", () => {
  test("penerimaan dan pengiriman divalidasi tanpa dokumen BC", async () => {
    await inRollback(db, async (tx) => {
      // insertSourceTransfer memvalidasi penerimaan sebelum membuat pengiriman.
      const delivery = await insertSourceTransfer(tx, "25", product)
      await tx.execute(sql`select validate_transfer(${delivery})`)
      const [row] = await tx
        .select({ status: transfers.status })
        .from(transfers)
        .where(eq(transfers.id, delivery))
      expect(row.status).toBe("done")
    })
  })
})
