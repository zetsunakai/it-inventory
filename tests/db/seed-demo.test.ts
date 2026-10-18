import { eq, sql } from "drizzle-orm"
import { afterAll, expect, test } from "vitest"

import { createDb, type Db } from "@/server/db/client"
import {
  customsDocuments,
  locations,
  products,
  transfers,
  uomCategories,
  uoms,
} from "@/server/db/schema"
import { seedDemoCustoms } from "@/server/db/seed-demo"

import { TEST_DATABASE_URL } from "../test-env"
import { insertTestCompany } from "./customs-fixtures"
import { inRollback } from "./helpers"

// Seed demo alur dokumen BC (backlog M4-07): dijalankan dengan gerbang dokumen aktif, jadi
// penerimaan demo benar-benar lolos gerbang. Semua data di-rollback.

const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

test("BC 2.3 Terdaftar, penerimaan Selesai lewat gerbang, BC 2.5 Siap ajukan dengan alokasi asal", async () => {
  await inRollback(db, async (tx) => {
    await insertTestCompany(tx)
    // Data dasar dari seed utama (satuan M, lokasi VENDOR) bila belum ada di database tes.
    const [length] = await tx
      .insert(uomCategories)
      .values({ code: "ZDLEN", name: "Panjang uji demo" })
      .returning({ id: uomCategories.id })
    await tx
      .insert(uoms)
      .values({ code: "M", name: "Meter", categoryId: length.id, factor: "1", isReference: true })
      .onConflictDoNothing()
    await tx
      .insert(locations)
      .values({ code: "VENDOR", name: "Vendor", type: "vendor" })
      .onConflictDoNothing()

    await seedDemoCustoms(tx as unknown as Db)
    // Idempoten: kali kedua dilewati.
    await seedDemoCustoms(tx as unknown as Db)

    const [product] = await tx.select().from(products).where(eq(products.sku, "DEMO-KAIN"))
    const docs = await tx
      .select({ docCode: customsDocuments.docCode, status: customsDocuments.status })
      .from(customsDocuments)
      .where(
        sql`exists (select 1 from customs_document_lines l
        where l.document_id = ${customsDocuments.id} and l.product_id = ${product.id})`,
      )
      .orderBy(customsDocuments.docCode)
    expect(docs).toEqual([
      { docCode: "23", status: "registered" },
      { docCode: "25", status: "ready" },
    ])
    const [receipt] = await tx
      .select({ status: transfers.status, documentId: transfers.customsDocumentId })
      .from(transfers)
      .where(eq(transfers.reference, "PO-DEMO-001"))
    expect(receipt.status).toBe("done")
    expect(receipt.documentId).not.toBeNull()
  })
})
