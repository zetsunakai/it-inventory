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
import type { CustomsDocCode } from "@/modules/it-inventory/lib/customs"

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
  await tx.insert(customsDocumentLines).values({
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
  await tx
    .insert(customsAttachments)
    .values({ documentId: doc.id, seq: 1, documentTypeCode: "380", number: "INV-1" })
  await tx
    .insert(customsPackages)
    .values({ documentId: doc.id, seq: 1, qty: "10", packageTypeCode: "RO" })
  await tx
    .insert(customsTransports)
    .values({ documentId: doc.id, seq: 1, transportModeCode: "1", name: "EVER GIVEN" })
  return doc
}

// Hapus semua dokumen BC uji, termasuk yang sudah Diajukan/Terdaftar (biasanya dikunci trigger).
export async function purgeCustomsDocuments(db: Db) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.customs_status_write', 'on', true)`)
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
