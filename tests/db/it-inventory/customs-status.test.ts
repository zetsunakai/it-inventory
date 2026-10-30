import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocuments,
  customsDocumentTransfers,
} from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertSourceTransfer,
  insertTestCompany,
  submitDocument,
} from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint } from "../../shared/db/helpers"

// Alur status dokumen BC mengikuti hmx (backlog H-01, PRD 7.3): Draft → Submitted lewat Submit.
// Dokumen Submitted dikunci database beserta semua bagiannya; Draft boleh dihapus.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

beforeAll(async () => {
  await insertTestCompany(db)
})

afterAll(async () => {
  await db.delete(company)
  await db.$client.end()
})

async function status(tx: Tx, id: string) {
  const [row] = await tx
    .select({ status: customsDocuments.status, submittedAt: customsDocuments.submittedAt })
    .from(customsDocuments)
    .where(eq(customsDocuments.id, id))
  return row
}

async function completeDocument(tx: Tx) {
  const product = await insertCustomsProduct(tx)
  return insertCompleteDocument(tx, "25", product)
}

describe("Draft", () => {
  test("dokumen baru Draft dengan nomor urut per jenis IT/<kode>/<5 digit>", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const first = await insertCompleteDocument(tx, "25", product)
      const second = await insertCompleteDocument(tx, "25", product)
      expect(first.status).toBe("draft")
      expect(first.number).toMatch(/^IT\/25\/\d{5}$/)
      expect(Number(second.number.slice(-5))).toBe(Number(first.number.slice(-5)) + 1)
      expect(first.ajuNumber).toBeNull()
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ number: "IT/25/99999" })
            .where(eq(customsDocuments.id, first.id)),
        ),
      ).toBe("Nomor dokumen IT Inventory tidak bisa diubah.")
    })
  })

  test("Submit dokumen belum lengkap melaporkan semua kekurangannya", async () => {
    await inRollback(db, async (tx) => {
      const [doc] = await tx.insert(customsDocuments).values({ docCode: "41" }).returning()
      const message = await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select submit_customs_document(${doc.id})`),
      )
      expect(message.split("\n")).toEqual(
        expect.arrayContaining([
          "Dokumen belum punya barang.",
          "Lampiran Invoice belum ada.",
          "Inventory Transfer Documents wajib diisi.",
        ]),
      )
    })
  })

  test("status hanya berubah lewat Submit", async () => {
    await inRollback(db, async (tx) => {
      const doc = await completeDocument(tx)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ status: "submitted" })
            .where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe("Gunakan tombol Submit untuk mengubah status dokumen.")
    })
  })

  test("Draft boleh dihapus beserta tautan transfernya", async () => {
    await inRollback(db, async (tx) => {
      const doc = await completeDocument(tx)
      const [line] = await tx
        .select({ productId: customsDocumentLines.productId })
        .from(customsDocumentLines)
        .where(eq(customsDocumentLines.documentId, doc.id))
      const transferId = await insertSourceTransfer(tx, "25", line.productId)
      await tx.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId })
      await tx.delete(customsDocuments).where(eq(customsDocuments.id, doc.id))
      expect(
        await tx
          .select()
          .from(customsDocumentTransfers)
          .where(eq(customsDocumentTransfers.transferId, transferId)),
      ).toEqual([])
    })
  })
})

describe("Submitted", () => {
  test("dokumen Submitted tidak bisa diubah atau dihapus, termasuk bagian-bagiannya", async () => {
    await inRollback(db, async (tx) => {
      const doc = await completeDocument(tx)
      await submitDocument(tx, doc)
      const row = await status(tx, doc.id)
      expect(row.status).toBe("submitted")
      expect(row.submittedAt).not.toBeNull()

      const locked = `Dokumen ${doc.number} sudah Submitted dan tidak dapat diubah atau dihapus.`
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.update(customsDocuments).set({ notes: "x" }).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocumentLines)
            .set({ qty: "1" })
            .where(eq(customsDocumentLines.documentId, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(customsAttachments).where(eq(customsAttachments.documentId, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .delete(customsDocumentTransfers)
            .where(eq(customsDocumentTransfers.documentId, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(customsDocuments).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select submit_customs_document(${doc.id})`),
        ),
      ).toBe(locked)
    })
  })
})

describe("semua jenis dokumen", () => {
  test.each(CUSTOMS_DOC_CODES)("BC %s bisa di-Submit", async (code) => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const doc = await insertCompleteDocument(tx, code, product)
      await submitDocument(tx, doc)
      expect((await status(tx, doc.id)).status).toBe("submitted")
    })
  })
})
