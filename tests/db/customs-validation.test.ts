import { and, eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocuments,
  customsTransports,
  docValidationRules,
} from "@/server/db/schema"

import { insertCompleteDocument, insertCustomsProduct, insertTestCompany } from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint } from "./helpers"

// Aturan validasi kelengkapan dokumen BC (backlog M3-03, PRD 7.2 dan 7.6): field wajib sebagai
// data per doc_code, semua kekurangan dilaporkan sekaligus.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

beforeAll(async () => {
  await insertTestCompany(db)
})

afterAll(async () => {
  await db.delete(company)
  await db.$client.end()
})

async function errorsOf(tx: Tx, documentId: string) {
  const { rows } = await tx.execute<{ errors: string[] }>(
    sql`select customs_document_errors(${documentId}) as errors`,
  )
  return rows[0].errors
}

describe("customs_document_errors", () => {
  test.each(CUSTOMS_DOC_CODES)(
    "dokumen BC %s yang lengkap tidak punya kekurangan",
    async (code) => {
      await inRollback(db, async (tx) => {
        const product = await insertCustomsProduct(tx)
        const doc = await insertCompleteDocument(tx, code, product)
        expect(await errorsOf(tx, doc.id)).toEqual([])
      })
    },
  )

  test("dokumen kosong: semua kekurangan dilaporkan sekaligus, urut sesuai aturan", async () => {
    await inRollback(db, async (tx) => {
      const [doc] = await tx.insert(customsDocuments).values({ docCode: "25" }).returning()
      const errors = await errorsOf(tx, doc.id)
      expect(errors.slice(0, 5)).toEqual([
        "Dokumen belum punya barang.",
        "Kantor Pabean belum diisi.",
        "Entitas Pengusaha TPB belum diisi.",
        "Entitas Pemilik Barang belum diisi.",
        "Entitas Penerima Barang belum diisi.",
      ])
      expect(errors).toContain("Lampiran Invoice belum ada.")
      expect(errors).toContain("Alasan Pengiriman belum diisi.")
      expect(errors).toContain("Kemasan: Jenis kemasan belum diisi.")
      expect(errors).toContain("Nama Penandatangan belum diisi.")
    })
  })

  test("dokumen keluar tanpa invoice tidak lengkap", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const doc = await insertCompleteDocument(tx, "41", product)
      await tx.delete(customsAttachments).where(eq(customsAttachments.documentId, doc.id))
      expect(await errorsOf(tx, doc.id)).toEqual(["Lampiran Invoice belum ada."])
    })
  })

  test("BC 2.3 dan BC 3.0 wajib data pengangkutan", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      for (const code of ["23", "30"] as const) {
        const doc = await insertCompleteDocument(tx, code, product)
        await tx
          .update(customsTransports)
          .set({ name: " " })
          .where(eq(customsTransports.documentId, doc.id))
        expect(await errorsOf(tx, doc.id)).toEqual([
          "Pengangkutan: Nama Sarana Angkut belum diisi.",
        ])
      }
    })
  })

  test("kekurangan barang disebut per seri; teks kosong dan details kosong dianggap belum diisi", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const doc = await insertCompleteDocument(tx, "23", product)
      await tx.insert(customsDocumentLines).values({
        documentId: doc.id,
        seq: 2,
        productId: product,
        qty: "5",
        ceisaUnitCode: "MTR",
        stockQty: "5",
        netWeight: "5",
        cifValue: "50",
        description: "  ",
      })
      await tx
        .update(customsDocuments)
        .set({ details: sql`${customsDocuments.details} || '{"bc11Number": ""}'` })
        .where(eq(customsDocuments.id, doc.id))
      expect(await errorsOf(tx, doc.id)).toEqual([
        "Nomor BC 1.1 belum diisi.",
        "Barang seri 2: Uraian Jenis Barang belum diisi.",
        "Barang seri 2: Negara Asal Barang belum diisi.",
      ])
    })
  })

  test("aturan nonaktif tidak diperiksa", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const doc = await insertCompleteDocument(tx, "41", product)
      await tx.delete(customsAttachments).where(eq(customsAttachments.documentId, doc.id))
      await tx
        .update(docValidationRules)
        .set({ active: false })
        .where(
          and(eq(docValidationRules.docCode, "41"), eq(docValidationRules.target, "attachment")),
        )
      expect(await errorsOf(tx, doc.id)).toEqual([])
    })
  })
})

describe("doc_validation_rules", () => {
  test("field bagian berupa tabel harus nama kolom yang ada", async () => {
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(docValidationRules)
            .values({ docCode: "23", target: "line", field: "hs_kode", label: "Kode HS" }),
        ),
      ).toBe("Kolom hs_kode tidak ada di customs_document_lines.")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(docValidationRules)
            .values({ docCode: "23", target: "line", field: "hs_code", label: "Kode HS" }),
        ),
      ).toContain("doc_validation_rules_field_unique")
    })
  })
})
