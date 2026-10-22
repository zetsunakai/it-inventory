import { eq, sql } from "drizzle-orm"
import { afterAll, expect, test } from "vitest"

import { createDb, type Db } from "@/server/db/client"
import {
  customsDocuments,
  customsDocumentTransfers,
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

// Seed demo alur dokumen BC (backlog M4-07, H-07): BC 2.3 Submitted memilih penerimaan Selesai, dan
// BC 2.5 Draft bisa memilih pengiriman Siap lalu di-Submit. Semua data di-rollback.

const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

test("BC 2.3 Submitted dengan penerimaan, BC 2.5 Draft bisa memilih pengiriman lalu Submit", async () => {
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
      .values([
        { code: "VENDOR", name: "Vendor", type: "vendor" },
        { code: "CUSTOMER", name: "Customer", type: "customer" },
      ])
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
      { docCode: "23", status: "submitted" },
      { docCode: "25", status: "draft" },
    ])
    const [receipt] = await tx
      .select({ status: transfers.status, documentId: customsDocumentTransfers.documentId })
      .from(transfers)
      .leftJoin(customsDocumentTransfers, eq(customsDocumentTransfers.transferId, transfers.id))
      .where(eq(transfers.reference, "PO-DEMO-001"))
    expect(receipt.status).toBe("done")
    expect(receipt.documentId).not.toBeNull()

    // Alur demo: BC 2.5 memilih pengiriman Siap, lalu Submit.
    const [delivery] = await tx
      .select({ id: transfers.id, status: transfers.status })
      .from(transfers)
      .where(eq(transfers.reference, "SO-DEMO-001"))
    expect(delivery.status).toBe("ready")
    const [bc25] = await tx
      .select({ id: customsDocuments.id })
      .from(customsDocuments)
      .where(
        sql`${customsDocuments.docCode} = '25' and exists (select 1 from customs_document_lines l
        where l.document_id = ${customsDocuments.id} and l.product_id = ${product.id})`,
      )
    await tx
      .insert(customsDocumentTransfers)
      .values({ documentId: bc25.id, transferId: delivery.id })
    await tx.execute(sql`select submit_customs_document(${bc25.id})`)
    const [submitted] = await tx
      .select({ status: customsDocuments.status })
      .from(customsDocuments)
      .where(eq(customsDocuments.id, bc25.id))
    expect(submitted.status).toBe("submitted")
  })
})
