import { and, eq, inArray, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  auditLogs,
  company,
  customsAttachments,
  customsContainers,
  customsDocumentLines,
  customsDocumentParties,
  customsDocumentTaxes,
  customsDocuments,
  customsDocumentTransfers,
  customsPackages,
  customsTransports,
  products,
  transfers,
  uomCategories,
  uoms,
} from "@/server/db/schema"

import { insertSourceTransfer, insertTestCompany } from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint, setAuditUser } from "./helpers"

// Skema dokumen BC (backlog M3-01, PRD bagian 7 dan 13): satu set tabel untuk semua jenis
// dokumen, dibedakan doc_code. Nomor dokumen dan nomor aju manual (H-01, PRD 7.4). Data uji dibuat di transaksi yang
// di-rollback, kecuali profil perusahaan dan dokumen dari tes penomoran bersamaan.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ACTOR = "7a2d3c4b-5e6f-4a1b-9c8d-0e1f2a3b4c5d"

const committedDocuments: string[] = []

beforeAll(async () => {
  await insertTestCompany(db)
})

afterAll(async () => {
  if (committedDocuments.length) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.customs_status_write', 'on', true)`)
      await tx.delete(customsDocuments).where(inArray(customsDocuments.id, committedDocuments))
    })
  }
  await db.delete(company)
  await db.$client.end()
})

async function fixtures(tx: Tx) {
  const [category] = await tx
    .insert(uomCategories)
    .values({ code: "ZBCAT", name: "Unit uji BC" })
    .returning({ id: uomCategories.id })
  const [unit] = await tx
    .insert(uoms)
    .values({
      code: "ZBPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  const [ready, noHs, archived] = await tx
    .insert(products)
    .values([
      {
        sku: "ZBP1",
        name: "Kain katun",
        category: "raw_material",
        uomId: unit.id,
        hsCode: "52081100",
      },
      { sku: "ZBP2", name: "Tanpa HS", category: "raw_material", uomId: unit.id },
      {
        sku: "ZBP3",
        name: "Arsip",
        category: "raw_material",
        uomId: unit.id,
        hsCode: "52081100",
        active: false,
      },
    ])
    .returning({ id: products.id })
  return { ready: ready.id, noHs: noHs.id, archived: archived.id }
}

async function draft(tx: Tx, values: Partial<typeof customsDocuments.$inferInsert> = {}) {
  const [doc] = await tx
    .insert(customsDocuments)
    .values({ docCode: "23", ...values })
    .returning()
  return doc
}

describe("customs_documents", () => {
  test("dokumen lengkap tersimpan dengan semua bagiannya, dan terhapus bersama bagiannya", async () => {
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, ACTOR)
      const product = await fixtures(tx)
      const doc = await draft(tx, {
        currencyCode: "USD",
        ndpbm: "15750.5",
        cifValue: "1200.50",
        details: { loadingPortCode: "CNSHA", bc11Number: "000123" },
      })
      expect(doc).toMatchObject({
        status: "draft",
        number: expect.stringMatching(/^IT\/23\//),
        createdBy: ACTOR,
      })

      await tx.insert(customsDocumentParties).values([
        { documentId: doc.id, entityTypeCode: "3", name: "PT Uji Berikat", identityTypeCode: "6" },
        { documentId: doc.id, entityTypeCode: "5", name: "Supplier Ltd", countryCode: "CN" },
      ])
      const [line] = await tx
        .insert(customsDocumentLines)
        .values({
          documentId: doc.id,
          seq: 1,
          productId: product.ready,
          qty: "100",
          ceisaUnitCode: "MTR",
          stockQty: "100",
        })
        .returning()
      await tx.insert(customsDocumentTaxes).values([
        { documentId: doc.id, seq: 1, levyTypeCode: "BM", rate: "10", amount: "120.05" },
        { documentId: doc.id, seq: 2, levyTypeCode: "PPN", rate: "11", status: "computed" },
      ])
      await tx.insert(customsAttachments).values({
        documentId: doc.id,
        lineId: line.id,
        seq: 1,
        documentTypeCode: "911",
        number: "LARTAS-1",
      })
      await tx.insert(customsAttachments).values({
        documentId: doc.id,
        seq: 1,
        documentTypeCode: "380",
        number: "INV-001",
        date: "2026-10-01",
      })
      await tx.insert(customsPackages).values({
        documentId: doc.id,
        seq: 1,
        qty: "10",
        packageTypeCode: "RO",
      })
      await tx
        .insert(customsContainers)
        .values({ documentId: doc.id, seq: 1, number: "MSKU1234567" })
      await tx.insert(customsTransports).values({ documentId: doc.id, seq: 1, name: "EVER GIVEN" })

      const { rows: direction } = await tx.execute<{ direction: string }>(
        sql`select customs_doc_direction(${doc.docCode}) as direction`,
      )
      expect(direction).toEqual([{ direction: "in" }])

      const logs = await tx
        .select({ action: auditLogs.action, userId: auditLogs.userId })
        .from(auditLogs)
        .where(and(eq(auditLogs.tableName, "customs_documents"), eq(auditLogs.recordId, doc.id)))
      expect(logs).toEqual([{ action: "INSERT", userId: ACTOR }])

      await tx.delete(customsDocuments).where(eq(customsDocuments.id, doc.id))
      const {
        rows: [left],
      } = await tx.execute<{ count: number }>(sql`
        select (select count(*) from customs_document_parties where document_id = ${doc.id})
          + (select count(*) from customs_document_lines where document_id = ${doc.id})
          + (select count(*) from customs_document_taxes where document_id = ${doc.id})
          + (select count(*) from customs_attachments where document_id = ${doc.id})
          + (select count(*) from customs_packages where document_id = ${doc.id})
          + (select count(*) from customs_containers where document_id = ${doc.id})
          + (select count(*) from customs_transports where document_id = ${doc.id})
          as count`)
      expect(Number(left.count)).toBe(0)
    })
  })

  test("arah dokumen mengikuti jenisnya", async () => {
    const { rows } = await db.execute<Record<string, string>>(sql`
      select customs_doc_direction('23') as "23", customs_doc_direction('40') as "40",
        customs_doc_direction('25') as "25", customs_doc_direction('30') as "30",
        customs_doc_direction('41') as "41"`)
    expect(rows[0]).toEqual({ "23": "in", "40": "in", "25": "out", "30": "out", "41": "out" })
  })

  test("dokumen baru selalu Draft dan jenisnya tidak bisa diubah", async () => {
    await inRollback(db, async (tx) => {
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { status: "submitted" }))).toBe(
        "Dokumen BC baru selalu berstatus Draft.",
      )
      const doc = await draft(tx)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.update(customsDocuments).set({ docCode: "40" }).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe("Jenis dokumen BC tidak bisa diubah.")
    })
  })

  test("constraint header: details berupa objek, NDPBM positif, nilai tidak negatif", async () => {
    await inRollback(db, async (tx) => {
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { details: [1, 2] }))).toContain(
        "customs_documents_details_object",
      )
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { ndpbm: "0" }))).toContain(
        "customs_documents_ndpbm_positive",
      )
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { cifValue: "-1" }))).toContain(
        "customs_documents_values_not_negative",
      )
    })
  })

  test("satu entitas per peran di setiap dokumen", async () => {
    await inRollback(db, async (tx) => {
      const doc = await draft(tx)
      await tx
        .insert(customsDocumentParties)
        .values({ documentId: doc.id, entityTypeCode: "3", name: "PT Uji" })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(customsDocumentParties)
            .values({ documentId: doc.id, entityTypeCode: "3", name: "PT Lain" }),
        ),
      ).toContain("customs_document_parties_role_unique")
    })
  })
})

describe("nomor dokumen dan nomor aju", () => {
  test("nomor IT/<kode>/<5 digit> urut per jenis; nomor yang dikirim aplikasi dipakai apa adanya", async () => {
    await inRollback(db, async (tx) => {
      const first = await draft(tx)
      const second = await draft(tx)
      const other = await draft(tx, { docCode: "40" })
      expect(first.number).toMatch(/^IT\/23\/\d{5}$/)
      expect(Number(second.number.slice(-5))).toBe(Number(first.number.slice(-5)) + 1)
      expect(other.number).toMatch(/^IT\/40\/\d{5}$/)
    })
  })

  test("nomor aju diisi manual dan boleh diubah selama Draft", async () => {
    await inRollback(db, async (tx) => {
      const doc = await draft(tx)
      expect(doc.ajuNumber).toBeNull()
      expect(doc.ajuDate).toBeNull()
      const [updated] = await tx
        .update(customsDocuments)
        .set({ ajuNumber: "00002305050020260101000001", ajuDate: "2026-01-01" })
        .where(eq(customsDocuments.id, doc.id))
        .returning()
      expect(updated).toMatchObject({
        ajuNumber: "00002305050020260101000001",
        ajuDate: "2026-01-01",
        number: doc.number,
      })
    })
  })

  test("10 dokumen dibuat bersamaan mendapat nomor unik", async () => {
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        db
          .insert(customsDocuments)
          .values({ docCode: "25" })
          .returning({ id: customsDocuments.id, number: customsDocuments.number }),
      ),
    )
    committedDocuments.push(...rows.map(([row]) => row.id))
    expect(new Set(rows.map(([row]) => row.number)).size).toBe(10)
  })
})

describe("customs_document_lines", () => {
  test("data produk disalin ke baris; yang diisi user tidak ditimpa", async () => {
    await inRollback(db, async (tx) => {
      const product = await fixtures(tx)
      const doc = await draft(tx)
      const [copied, typed] = await tx
        .insert(customsDocumentLines)
        .values([
          { documentId: doc.id, seq: 1, productId: product.ready },
          {
            documentId: doc.id,
            seq: 2,
            productId: product.ready,
            hsCode: "52081200",
            description: "Kain katun putih 100%",
          },
        ])
        .returning()
      expect(copied).toMatchObject({
        category: "raw_material",
        itemCode: "ZBP1",
        hsCode: "52081100",
        description: "Kain katun",
      })
      expect(typed).toMatchObject({ hsCode: "52081200", description: "Kain katun putih 100%" })
    })
  })

  test("hanya produk aktif yang punya kode HS; seri unik per dokumen; qty positif", async () => {
    await inRollback(db, async (tx) => {
      const product = await fixtures(tx)
      const doc = await draft(tx)
      const line = (values: Partial<typeof customsDocumentLines.$inferInsert>) =>
        pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(customsDocumentLines)
            .values({ documentId: doc.id, seq: 1, productId: product.ready, ...values }),
        )

      expect(await line({ productId: product.noHs })).toBe(
        "Produk ZBP2 belum siap dokumen BC: kode HS belum diisi.",
      )
      expect(await line({ productId: product.archived })).toBe("Produk ZBP3 sudah diarsipkan.")
      expect(await line({ qty: "0" })).toContain("customs_document_lines_qty_positive")
      expect(await line({ seq: 0 })).toContain("customs_document_lines_seq_positive")

      await tx
        .insert(customsDocumentLines)
        .values({ documentId: doc.id, seq: 1, productId: product.ready })
      expect(await line({})).toContain("customs_document_lines_seq_unique")
    })
  })
})

describe("relasi ke transfer", () => {
  test("transfer yang sudah dipilih dokumen tidak bisa dihapus", async () => {
    await inRollback(db, async (tx) => {
      const product = await fixtures(tx)
      const doc = await draft(tx)
      const transferId = await insertSourceTransfer(tx, "23", product.ready)
      await tx.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(transfers).where(eq(transfers.id, transferId)),
        ),
      ).toContain("customs_document_transfers_transfer_id_transfers_id_fk")
    })
  })
})
