import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import { saveCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import {
  emptyDraft,
  syncTransferLines,
  type CustomsDocumentDraft,
  type CustomsTransferChoice,
} from "@/modules/it-inventory/lib/customs-form"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"
import { getCustomsDocument } from "@/modules/it-inventory/server/queries/customs-documents"
import {
  customsTransferProducts,
  getDocumentTransfers,
  getTransferCustoms,
  searchCustomsTransfers,
} from "@/modules/it-inventory/server/queries/customs-transfers"
import type { CurrentUser } from "@/server/auth/session"
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

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

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

describe("form memilih transfer (H-04)", () => {
  const choice = async (id: string): Promise<CustomsTransferChoice> => {
    const [row] = await db
      .select({ number: transfers.number, type: transfers.type, status: transfers.status })
      .from(transfers)
      .where(eq(transfers.id, id))
    return { id, number: row.number, type: row.type, movementCode: "gr", status: row.status }
  }
  const save = (docCode: string, draft: CustomsDocumentDraft, id?: string) => {
    const data = new FormData()
    data.set("docCode", docCode)
    data.set("document", JSON.stringify(draft))
    if (id) data.set("id", id)
    return saveCustomsDocument(null, data)
  }
  const linked = async (documentId: string) =>
    (
      await db
        .select({ transferId: customsDocumentTransfers.transferId })
        .from(customsDocumentTransfers)
        .where(eq(customsDocumentTransfers.documentId, documentId))
    ).map((row) => row.transferId)

  test("pilihan transfer tersimpan, barang terisi per produk, dan bisa dilepas", async () => {
    session.user = {
      id: crypto.randomUUID(),
      name: "Staf Exim",
      email: "exim@it-inventory.local",
      roles: ["staf_exim"],
      twoFactorEnabled: true,
    }
    const receipt = await db.transaction((tx) => insertSourceTransfer(tx, "23", product))
    const picked = await choice(receipt)

    // Pemilih hanya menampilkan sumber yang diizinkan, Siap atau Selesai.
    const found = await searchCustomsTransfers({
      docCode: "23",
      source: "gr",
      search: picked.number,
      offset: 0,
      limit: 20,
    })
    expect(found.map((row) => row.id)).toEqual([receipt])
    expect(found[0]).toMatchObject({
      movementCode: "gr",
      status: "ready",
      partnerName: "Partner uji BC",
    })
    expect(
      await searchCustomsTransfers({
        docCode: "23",
        source: "gi",
        search: "",
        offset: 0,
        limit: 20,
      }),
    ).toEqual([])

    // Transfer yang sama dua kali: satu tautan, satu baris barang.
    const items = await customsTransferProducts([receipt, receipt])
    expect(items).toEqual([
      { productId: product, sku: "ZBT1", name: "Kain katun", hsCode: "52081100", qty: "100.0000" },
    ])
    const draft = emptyDraft()
    draft.transfers = [picked, picked]
    // No. Aju, No. Daftar, dan Tgl. Daftar diisi manual di header (H-03).
    draft.header.ajuNumber = "000023zb0120261020 00000001"
    draft.header.registrationNumber = "123456"
    draft.header.registrationDate = "2026-10-20"
    draft.lines = syncTransferLines(syncTransferLines(draft.lines, items), items)
    const created = await save("23", draft)
    if (!created.ok) throw new Error(created.errors.join("\n"))
    const id = created.data.id
    expect(await linked(id)).toEqual([receipt])
    const saved = await getCustomsDocument(BC23, id)
    expect(saved?.draft.transfers).toEqual([picked])
    expect(saved).toMatchObject({
      ajuNumber: "000023ZB012026102000000001",
      registrationNumber: "123456",
      registrationDate: "2026-10-20",
      companyName: "PT Uji Berikat",
    })
    expect(saved?.draft.lines).toEqual([
      expect.objectContaining({ productId: product, qty: "100", stockQty: "100" }),
    ])

    // Satu transfer boleh dipilih dokumen lain.
    const other = await save("23", { ...emptyDraft(), lines: draft.lines, transfers: [picked] })
    expect(other.ok).toBe(true)

    // Transfer di luar sumber jenis dokumen ditolak database dengan nomor transfernya.
    const delivery = await db.transaction((tx) => insertSourceTransfer(tx, "25", product))
    const wrong = await choice(delivery)
    const rejected = await save("23", { ...saved!.draft, transfers: [picked, wrong] }, id)
    expect(rejected).toMatchObject({
      ok: false,
      errors: [
        `Dokumen BC 2.3 hanya dapat dikaitkan dengan sumber inventory yang diizinkan. Transfer tidak valid: ${wrong.number} (gi, Siap).`,
      ],
    })
    expect(await linked(id)).toEqual([receipt])

    // Dilepas dari form: tautannya hilang, barang tetap.
    const released = await save("23", { ...saved!.draft, transfers: [] }, id)
    expect(released.ok).toBe(true)
    expect(await linked(id)).toEqual([])
    expect((await getCustomsDocument(BC23, id))?.draft.lines).toHaveLength(1)
  })
})
