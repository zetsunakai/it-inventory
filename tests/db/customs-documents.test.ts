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
  customsDocuments,
  customsLineTaxes,
  customsPackages,
  customsTransports,
  locations,
  partners,
  products,
  systemSettings,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { CUSTOMS_TEST_OFFICE, insertTestCompany } from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint, setAuditUser } from "./helpers"

// Skema dokumen BC (backlog M3-01, PRD bagian 7 dan 13): satu set tabel untuk semua jenis
// dokumen, dibedakan doc_code. Nomor aju (M3-02, PRD 7.4). Data uji dibuat di transaksi yang
// di-rollback, kecuali profil perusahaan dan dokumen dari tes penomoran bersamaan.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ACTOR = "7a2d3c4b-5e6f-4a1b-9c8d-0e1f2a3b4c5d"

// Kantor pengawas di profil perusahaan menjadi kode kantor nomor aju bila dokumen belum memilih.
const OFFICE = CUSTOMS_TEST_OFFICE
const committedDocuments: string[] = []

beforeAll(async () => {
  await insertTestCompany(db)
})

afterAll(async () => {
  if (committedDocuments.length) {
    await db.delete(customsDocuments).where(inArray(customsDocuments.id, committedDocuments))
  }
  await db.delete(company)
  await db.$client.end()
})

function todayWib() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }).replaceAll("-", "")
}

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
      expect(doc).toMatchObject({ status: "draft", version: 1, createdBy: ACTOR })

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
      await tx.insert(customsLineTaxes).values([
        { lineId: line.id, levyTypeCode: "BM", rate: "10", facilityCode: "3", amount: "120.05" },
        { lineId: line.id, levyTypeCode: "PPN", rate: "11", facilityCode: "3" },
      ])
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
          + (select count(*) from customs_line_taxes where line_id = ${line.id})
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
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { status: "ready" }))).toBe(
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

  test("constraint header: Terdaftar wajib nomor daftar, Batal wajib tanggal, details berupa objek", async () => {
    await inRollback(db, async (tx) => {
      const doc = await draft(tx)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ status: "registered" })
            .where(eq(customsDocuments.id, doc.id)),
        ),
      ).toContain("customs_documents_registered_has_number")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ status: "cancelled" })
            .where(eq(customsDocuments.id, doc.id)),
        ),
      ).toContain("customs_documents_cancelled_has_date")
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

describe("next_aju_number", () => {
  test("format 26 karakter: kode perusahaan, kode dokumen, kantor, tanggal WIB, nomor urut per jenis", async () => {
    await inRollback(db, async (tx) => {
      const first = await draft(tx)
      const second = await draft(tx)
      const other = await draft(tx, { docCode: "40", customsOfficeCode: "040300" })

      const prefix = `000023${OFFICE}${todayWib()}`
      expect(first.ajuNumber).toHaveLength(26)
      expect(first.ajuNumber.startsWith(prefix)).toBe(true)
      expect(Number(second.ajuNumber.slice(-6))).toBe(Number(first.ajuNumber.slice(-6)) + 1)
      expect(other.ajuNumber.slice(0, 20)).toBe(`000040040300${todayWib()}`)
      expect(first.ajuDate.replaceAll("-", "")).toBe(todayWib())
    })
  })

  test("nomor aju yang dikirim aplikasi diabaikan dan tidak bisa diubah", async () => {
    await inRollback(db, async (tx) => {
      const doc = await draft(tx, { ajuNumber: "X".repeat(26) })
      expect(doc.ajuNumber.startsWith("000023")).toBe(true)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ ajuNumber: "00002305050020260101000001" })
            .where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe("Nomor dan tanggal aju tidak bisa diubah.")
      // Perubahan lain (mis. naik versi saat revisi) tidak menyentuh nomor aju.
      const [revised] = await tx
        .update(customsDocuments)
        .set({ version: 2 })
        .where(eq(customsDocuments.id, doc.id))
        .returning()
      expect(revised.ajuNumber).toBe(doc.ajuNumber)
    })
  })

  test("kode perusahaan dan kantor harus sesuai format", async () => {
    await inRollback(db, async (tx) => {
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp, { customsOfficeCode: "ABC" }))).toBe(
        "Kode kantor pabean ABC harus 6 digit untuk nomor aju.",
      )
      await tx
        .update(systemSettings)
        .set({ value: "ab" })
        .where(eq(systemSettings.key, "customs.aju_company_code"))
      expect(await pgErrorInSavepoint(tx, (sp) => draft(sp))).toContain(
        "Kode perusahaan untuk nomor aju harus 3 huruf besar atau angka",
      )
    })
  })

  test("10 dokumen dibuat bersamaan mendapat nomor aju unik", async () => {
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        db
          .insert(customsDocuments)
          .values({ docCode: "25" })
          .returning({ id: customsDocuments.id, ajuNumber: customsDocuments.ajuNumber }),
      ),
    )
    committedDocuments.push(...rows.map(([row]) => row.id))
    expect(new Set(rows.map(([row]) => row.ajuNumber)).size).toBe(10)
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
  test("dokumen yang sudah dipakai transfer tidak bisa dihapus", async () => {
    await inRollback(db, async (tx) => {
      const doc = await draft(tx)
      const [warehouse] = await tx
        .insert(warehouses)
        .values({ code: "ZBG1", name: "ZBG1", address: "Bekasi" })
        .returning({ id: warehouses.id })
      const [vendor, internal] = await tx
        .insert(locations)
        .values([
          { code: "ZBVEND", name: "Vendor", type: "vendor" },
          { code: "ZBRAK", name: "Rak", type: "internal", warehouseId: warehouse.id },
        ])
        .returning({ id: locations.id })
      const [partner] = await tx
        .insert(partners)
        .values({
          name: "ZB Vendor",
          address: "Jl. Uji",
          countryCode: "ID",
          identityType: "other",
          identityNumber: "ZB-1",
        })
        .returning({ id: partners.id })
      await tx.insert(transfers).values({
        type: "receipt",
        sourceLocationId: vendor.id,
        destinationLocationId: internal.id,
        partnerId: partner.id,
        customsDocumentId: doc.id,
      })

      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(customsDocuments).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toContain("transfers_customs_document_id_customs_documents_id_fk")
    })
  })
})
