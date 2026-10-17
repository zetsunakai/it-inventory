import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { BC25 } from "@/modules/it-inventory/lib/customs-specs"
import {
  getCustomsDocument,
  getCustomsRevision,
  listCustomsRevisions,
} from "@/modules/it-inventory/server/queries/customs-documents"
import { db } from "@/server/db"
import {
  company,
  customsDocumentLines,
  customsDocumentRevisions,
  customsDocuments,
  products,
  uomCategories,
  uoms,
  users,
} from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertTestCompany,
  purgeCustomsDocuments,
} from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint, setAuditUser } from "./helpers"

// Revisi dokumen BC Terdaftar (backlog M3-12, PRD 7.5): snapshot versi lama read-only, alasan
// wajib, nomor aju tetap, riwayat siapa/kapan/apa yang berubah.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

let userId = ""

beforeAll(async () => {
  await insertTestCompany(db)
  const [user] = await db
    .insert(users)
    .values({ name: "Exim Revisi", email: "zb-revisi@bc.test", emailVerified: true })
    .returning({ id: users.id })
  userId = user.id
})

afterAll(async () => {
  await purgeCustomsDocuments(db)
  await db.delete(products).where(like(products.sku, "ZBR%"))
  await db.delete(uoms).where(like(uoms.code, "ZBR%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZBR%"))
  await db.delete(users).where(eq(users.id, userId))
  await db.delete(company)
  await db.$client.end()
})

async function registeredDocument(tx: Tx, sku = "ZBR1") {
  const product = await insertCustomsProduct(tx, sku)
  const doc = await insertCompleteDocument(tx, "25", product)
  await tx.execute(sql`select refresh_customs_document_status(${doc.id})`)
  await tx.execute(sql`select submit_customs_document(${doc.id})`)
  await tx.execute(sql`select register_customs_document(${doc.id}, '000555', ${doc.ajuDate}::date)`)
  return doc
}

describe("revise_customs_document", () => {
  test("hanya dokumen Terdaftar, alasan wajib", async () => {
    await inRollback(db, async (tx) => {
      const [draft] = await tx.insert(customsDocuments).values({ docCode: "25" }).returning()
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select revise_customs_document(${draft.id}, 'salah HS')`),
        ),
      ).toBe("Hanya dokumen Terdaftar yang bisa direvisi.")
      const doc = await registeredDocument(tx)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select revise_customs_document(${doc.id}, ' ')`),
        ),
      ).toBe("Alasan revisi wajib diisi.")
    })
  })

  test("versi lama disimpan, dokumen naik versi dengan nomor aju yang sama; riwayat tidak bisa diubah", async () => {
    await inRollback(db, async (tx) => {
      const doc = await registeredDocument(tx)
      await setAuditUser(tx, userId)
      await tx.execute(sql`select revise_customs_document(${doc.id}, 'Koreksi berat bersih')`)

      const [revised] = await tx
        .select()
        .from(customsDocuments)
        .where(eq(customsDocuments.id, doc.id))
      // Isian masih lengkap, jadi langsung Siap ajukan.
      expect(revised).toMatchObject({ version: 2, status: "ready", ajuNumber: doc.ajuNumber })

      const [revision] = await tx
        .select()
        .from(customsDocumentRevisions)
        .where(eq(customsDocumentRevisions.documentId, doc.id))
      expect(revision).toMatchObject({
        version: 1,
        reason: "Koreksi berat bersih",
        createdBy: userId,
      })
      const snapshot = revision.snapshot as {
        document: Record<string, unknown>
        lines: Record<string, unknown>[]
        parties: unknown[]
      }
      expect(snapshot.document).toMatchObject({
        status: "registered",
        registration_number: "000555",
        version: 1,
      })
      expect(snapshot.lines[0]).toMatchObject({ sku: "ZBR1", seq: 1 })
      expect(snapshot.parties).toHaveLength(3)

      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocumentRevisions)
            .set({ reason: "x" })
            .where(eq(customsDocumentRevisions.documentId, doc.id)),
        ),
      ).toBe("Riwayat revisi dokumen BC tidak bisa diubah atau dihapus.")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .delete(customsDocumentRevisions)
            .where(eq(customsDocumentRevisions.documentId, doc.id)),
        ),
      ).toBe("Riwayat revisi dokumen BC tidak bisa diubah atau dihapus.")
    })
  })
})

describe("riwayat revisi", () => {
  test("menyebut siapa, kapan, alasan, dan isian yang berubah; versi lama bisa dibuka", async () => {
    const id = await db.transaction(async (tx) => {
      const doc = await registeredDocument(tx, "ZBR2")
      await setAuditUser(tx, userId)
      await tx.execute(sql`select revise_customs_document(${doc.id}, 'Kurs salah')`)
      await tx
        .update(customsDocuments)
        .set({ ndpbm: "16000" })
        .where(eq(customsDocuments.id, doc.id))
      await tx
        .update(customsDocumentLines)
        .set({ netWeight: "90" })
        .where(eq(customsDocumentLines.documentId, doc.id))
      return doc.id
    })

    const current = await getCustomsDocument(BC25, id)
    const revisions = await listCustomsRevisions(BC25, id, current!.draft)
    expect(revisions).toEqual([
      expect.objectContaining({
        version: 1,
        reason: "Kurs salah",
        userName: "Exim Revisi",
        changes: ["NDPBM (kurs)", "Barang seri 1"],
      }),
    ])

    const old = await getCustomsRevision(BC25, id, 1)
    expect(old).toMatchObject({ version: 1, registrationNumber: "000555" })
    expect(old?.draft.header.ndpbm).toBe("15000")
    expect(old?.draft.lines[0]).toMatchObject({ netWeight: "100", product: { sku: "ZBR2" } })
    expect(await getCustomsRevision(BC25, id, 2)).toBeNull()
  })
})
