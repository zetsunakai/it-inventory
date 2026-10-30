import { eq, sql } from "drizzle-orm"

import type { Db } from "@/server/db/client"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocumentParties,
  customsDocuments,
  customsDocumentTransfers,
  customsPackages,
  customsTransports,
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"
import {
  CUSTOMS_DOCUMENT_SOURCE_CODES,
  type CustomsDocCode,
} from "@/modules/it-inventory/lib/customs"

import { todayWib, withLine } from "../../shared/db/helpers"

// Data uji dokumen BC (M3, H-01): profil perusahaan, produk siap BC, dokumen yang lolos semua
// aturan validasi seed, dan transfer sumber yang bisa dipilih dokumen. Kode data uji berawalan ZB.

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

// Transfer Siap yang boleh dipilih dokumen jenis ini (customs_document_source_codes): penerimaan
// (gr) untuk dokumen masuk, pengiriman (gi) dari stok penerimaan Selesai untuk dokumen keluar.
export async function insertSourceTransfer(tx: Tx, docCode: CustomsDocCode, productId: string) {
  const suffix = crypto.randomUUID().slice(0, 8)
  const [product] = await tx
    .select({ uomId: products.uomId })
    .from(products)
    .where(eq(products.id, productId))
  const [warehouse] = await tx
    .insert(warehouses)
    .values({ code: `ZBW${suffix}`, name: "Gudang uji BC", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, customer, rack] = await tx
    .insert(locations)
    .values([
      { code: `ZBV${suffix}`, name: "Vendor", type: "vendor" as const },
      { code: `ZBC${suffix}`, name: "Customer", type: "customer" as const },
      { code: `ZBR${suffix}`, name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  const [partner] = await tx
    .insert(partners)
    .values({
      code: `ZBP${suffix}`,
      name: "Partner uji BC",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: suffix,
    })
    .returning({ id: partners.id })
  const transfer = async (type: "receipt" | "delivery", from: string, to: string) => {
    const [row] = await tx
      .insert(transfers)
      .values({
        type,
        sourceLocationId: from,
        destinationLocationId: to,
        partnerId: partner.id,
        scheduledDate: todayWib(),
      })
      .returning({ id: transfers.id })
    const move = await withLine(tx, {
      transferId: row.id,
      productId,
      inputQty: "100",
      inputUomId: product.uomId,
    })
    await tx
      .insert(stockMoves)
      .values({ ...move, sourceLocationId: from, destinationLocationId: to })
    await tx.execute(sql`select confirm_transfer(${row.id})`)
    return row.id
  }
  const receipt = await transfer("receipt", vendor.id, rack.id)
  if (CUSTOMS_DOCUMENT_SOURCE_CODES[docCode].includes("gr")) return receipt
  await tx.execute(sql`select validate_transfer(${receipt})`)
  return transfer("delivery", rack.id, customer.id)
}

// Pilih transfer sumber lalu Submit (Draft → Submitted).
export async function submitDocument(tx: Tx, doc: { id: string; docCode: CustomsDocCode }) {
  const [line] = await tx
    .select({ productId: customsDocumentLines.productId })
    .from(customsDocumentLines)
    .where(eq(customsDocumentLines.documentId, doc.id))
  const transferId = await insertSourceTransfer(tx, doc.docCode, line.productId)
  await tx.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId })
  await tx.execute(sql`select submit_customs_document(${doc.id})`)
  return transferId
}

// Hapus semua dokumen BC uji, termasuk yang sudah Submitted (biasanya dikunci trigger).
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
