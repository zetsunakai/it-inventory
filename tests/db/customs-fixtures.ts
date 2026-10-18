import { sql } from "drizzle-orm"

import type { Db } from "@/server/db/client"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocumentParties,
  customsDocuments,
  customsPackages,
  customsTransports,
  products,
  uomCategories,
  uoms,
} from "@/server/db/schema"
import { CUSTOMS_ORIGIN_DOC_CODES, type CustomsDocCode } from "@/modules/it-inventory/lib/customs"

// Data uji dokumen BC (M3): profil perusahaan (dibutuhkan nomor aju), produk siap BC, dan dokumen
// yang lolos semua aturan validasi seed. Kode data uji berawalan ZB.

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

export const CUSTOMS_TEST_OFFICE = "050500"

export async function insertTestCompany(db: Db | Tx) {
  await db.insert(company).values({
    name: "PT Uji Berikat",
    address: "Jl. Industri No. 1, Bekasi",
    npwp: "0012345678901000",
    nitku: "0012345678901000000000",
    nib: "1234567890123",
    facilityType: "kawasan_berikat",
    permitNumber: "KEP-1/2024",
    permitDate: "2024-03-15",
    supervisingOfficeCode: CUSTOMS_TEST_OFFICE,
  })
}

export async function insertCustomsProduct(tx: Tx, sku = "ZBP1") {
  const [category] = await tx
    .insert(uomCategories)
    .values({ code: `${sku}C`, name: `Unit ${sku}` })
    .returning({ id: uomCategories.id })
  const [unit] = await tx
    .insert(uoms)
    .values({
      code: `${sku}U`,
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  const [product] = await tx
    .insert(products)
    .values({
      sku,
      name: "Kain katun",
      category: "raw_material",
      uomId: unit.id,
      hsCode: "52081100",
    })
    .returning({ id: products.id })
  return product.id
}

const PARTIES: Record<CustomsDocCode, string[]> = {
  "23": ["3", "7", "5"],
  "40": ["3", "7", "9"],
  "25": ["3", "7", "8"],
  "30": ["2", "6"],
  "41": ["3", "7", "8"],
  "20": ["1", "7", "9"],
  "261": ["3", "8", "7"],
  "262": ["3", "9", "7"],
  "27": ["3", "7", "8"],
  "16": ["3", "7", "9"],
  "28": ["3", "1", "7"],
  "33": ["2", "3", "6"],
  "331": ["3", "8"],
}

// Dokumen Draft yang lolos semua aturan validasi seed untuk jenisnya.
export async function insertCompleteDocument(tx: Tx, docCode: CustomsDocCode, productId: string) {
  const [doc] = await tx
    .insert(customsDocuments)
    .values({
      docCode,
      customsOfficeCode: CUSTOMS_TEST_OFFICE,
      currencyCode: "USD",
      ndpbm: "15000",
      cifValue: "1000",
      fobValue: "900",
      freightValue: "50",
      deliveryPrice: "15000000",
      grossWeight: "120",
      netWeight: "100",
      signerName: "Budi",
      signerPosition: "Manajer Exim",
      signerCity: "Bekasi",
      signedDate: "2026-10-17",
      details: {
        insuranceTypeCode: "LN",
        loadingPortCode: "CNSHA",
        unloadingPortCode: "IDTPP",
        tpsCode: "TPS1",
        bc11Number: "000123",
        bc11Date: "2026-10-10",
        deliveryReasonCode: "1",
        incotermCode: "FOB",
        destinationPortCode: "SGSIN",
        destinationCountryCode: "SG",
        importTypeCode: "1",
        temporaryReasonCode: "1",
        destinationOfficeCode: "050500",
        plbWarehouseCode: "PLB01",
        exportTypeCode: "1",
      },
    })
    .returning()
  await tx.insert(customsDocumentParties).values(
    PARTIES[docCode].map((entityTypeCode) => ({
      documentId: doc.id,
      entityTypeCode,
      name: `Entitas ${entityTypeCode}`,
    })),
  )
  const [line] = await tx
    .insert(customsDocumentLines)
    .values({
      documentId: doc.id,
      seq: 1,
      productId,
      qty: "100",
      ceisaUnitCode: "MTR",
      stockQty: "100",
      netWeight: "100",
      originCountryCode: "CN",
      cifValue: "1000",
      fobValue: "900",
      deliveryPrice: "15000000",
    })
    .returning({ id: customsDocumentLines.id })
  await tx
    .insert(customsAttachments)
    .values({ documentId: doc.id, seq: 1, documentTypeCode: "380", number: "INV-1" })
  await tx
    .insert(customsPackages)
    .values({ documentId: doc.id, seq: 1, qty: "10", packageTypeCode: "RO" })
  await tx
    .insert(customsTransports)
    .values({ documentId: doc.id, seq: 1, transportModeCode: "1", name: "EVER GIVEN" })
  // Dokumen keluar MVP butuh alokasi dokumen asal (M4-03): BC 4.0 Terdaftar boleh untuk BC 2.5,
  // 3.0, dan 4.1.
  if (CUSTOMS_ORIGIN_DOC_CODES[docCode]) {
    const origin = await insertCompleteDocument(tx, "40", productId)
    await registerDocument(tx, origin.id, origin.ajuDate)
    const [originLine] = await tx
      .select({ id: customsDocumentLines.id })
      .from(customsDocumentLines)
      .where(sql`${customsDocumentLines.documentId} = ${origin.id}`)
    await tx.execute(
      sql`select allocate_origin(${line.id}, ${JSON.stringify([{ origin_line_id: originLine.id, qty: "100" }])}::jsonb)`,
    )
  }
  return doc
}

// Draft lengkap → Siap ajukan → Diajukan → Terdaftar.
export async function registerDocument(tx: Tx, id: string, ajuDate: string) {
  await tx.execute(sql`select refresh_customs_document_status(${id})`)
  await tx.execute(sql`select submit_customs_document(${id})`)
  await tx.execute(sql`select register_customs_document(${id}, '000777', ${ajuDate}::date)`)
}

// Hapus semua dokumen BC uji, termasuk yang sudah Diajukan/Terdaftar (biasanya dikunci trigger).
export async function purgeCustomsDocuments(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.customs_status_write', 'on', true)`)
    await tx.execute(sql`delete from origin_allocations`)
    await tx.delete(customsDocuments)
  })
}

// Ubah status langsung (melewati alur) untuk menyiapkan data uji.
export async function forceCustomsStatus(
  tx: Tx,
  id: string,
  values: Partial<typeof customsDocuments.$inferInsert>,
) {
  await tx.execute(sql`select set_config('app.customs_status_write', 'on', true)`)
  await tx
    .update(customsDocuments)
    .set(values)
    .where(sql`${customsDocuments.id} = ${id}`)
  await tx.execute(sql`select set_config('app.customs_status_write', '', true)`)
}
