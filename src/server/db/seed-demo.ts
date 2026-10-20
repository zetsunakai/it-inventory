import { eq, sql } from "drizzle-orm"

import type { Db } from "./client"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocumentParties,
  customsDocuments,
  customsPackages,
  customsTransports,
  locations,
  partners,
  products,
  stockMoves,
  transferLines,
  transfers,
  uoms,
  warehouses,
} from "./schema"

// Data demo alur dokumen BC (backlog M4-07), hanya bila SEED_DEMO_DATA=true dan profil perusahaan
// sudah diisi: BC 2.3 Terdaftar → penerimaan yang ditautkan dan divalidasi lewat gerbang → BC 2.5
// Draft dengan alokasi dokumen asal ke BC 2.3. Idempoten: dilewati bila produk demo sudah ada.

const PRODUCT_SKU = "DEMO-KAIN"

export async function seedDemoCustoms(db: Db) {
  const [profile] = await db.select().from(company)
  if (!profile) {
    console.log("Data demo dokumen BC dilewati: profil perusahaan belum diisi.")
    return
  }
  const [existing] = await db.select().from(products).where(eq(products.sku, PRODUCT_SKU))
  if (existing) return

  await db.transaction(async (tx) => {
    const [unit] = await tx.select().from(uoms).where(eq(uoms.code, "M"))
    const [vendor] = await tx.select().from(locations).where(eq(locations.code, "VENDOR"))
    const [product] = await tx
      .insert(products)
      .values({
        sku: PRODUCT_SKU,
        name: "Kain katun demo lebar 150 cm",
        category: "raw_material",
        uomId: unit.id,
        hsCode: "52081100",
      })
      .returning()
    const [warehouse] = await tx
      .insert(warehouses)
      .values({ code: "DEMO", name: "Gudang demo", address: profile.address })
      .returning()
    const [rack] = await tx
      .insert(locations)
      .values({ code: "DEMO-RAK", name: "Rak demo", type: "internal", warehouseId: warehouse.id })
      .returning()
    // Lokasi stok utama gudang demo (I-07).
    await tx
      .update(warehouses)
      .set({ stockLocationId: rack.id })
      .where(eq(warehouses.id, warehouse.id))
    const [supplier] = await tx
      .insert(partners)
      .values({
        name: "Demo Textile Supplier Ltd",
        address: "No. 1 Demo Road, Shanghai",
        countryCode: "CN",
        identityType: "other",
        identityNumber: "DEMO-CN-1",
      })
      .returning()

    const insertDocument = async (docCode: "23" | "25", partyCode: string) => {
      const [doc] = await tx
        .insert(customsDocuments)
        .values({
          docCode,
          customsOfficeCode: profile.supervisingOfficeCode,
          currencyCode: "USD",
          ndpbm: "15750",
          cifValue: "12500",
          freightValue: "250",
          deliveryPrice: "198000000",
          grossWeight: "1250",
          netWeight: "1180",
          signerName: "Petugas demo",
          signerPosition: "Staf exim",
          signerCity: "Bekasi",
          signedDate: sql`(now() at time zone 'Asia/Jakarta')::date`,
          details: {
            tpbTypeCode: "1",
            insuranceTypeCode: "LN",
            loadingPortCode: "CNSHA",
            unloadingPortCode: "IDTPP",
            tpsCode: "0402",
            bc11Number: "000123",
            bc11Date: "2026-10-01",
            deliveryReasonCode: "1",
          },
        })
        .returning()
      const companyParty = {
        name: profile.name,
        address: profile.address,
        countryCode: "ID",
        identityTypeCode: "6",
        identityNumber: profile.nitku,
      }
      await tx.insert(customsDocumentParties).values([
        {
          documentId: doc.id,
          entityTypeCode: "3",
          ...companyParty,
          nib: profile.nib,
          permitNumber: profile.permitNumber,
          permitDate: profile.permitDate,
        },
        { documentId: doc.id, entityTypeCode: "7", ...companyParty },
        {
          documentId: doc.id,
          entityTypeCode: partyCode,
          partnerId: supplier.id,
          name: supplier.name,
          address: supplier.address,
          countryCode: supplier.countryCode,
          identityTypeCode: "4",
          identityNumber: supplier.identityNumber,
        },
      ])
      const [line] = await tx
        .insert(customsDocumentLines)
        .values({
          documentId: doc.id,
          seq: 1,
          productId: product.id,
          qty: "1500",
          ceisaUnitCode: "MTR",
          stockQty: "1500",
          netWeight: "1180",
          originCountryCode: "CN",
          invoiceValue: "12500",
          cifValue: "12500",
          deliveryPrice: "198000000",
        })
        .returning()
      await tx
        .insert(customsAttachments)
        .values({ documentId: doc.id, seq: 1, documentTypeCode: "380", number: "INV-DEMO-001" })
      await tx
        .insert(customsPackages)
        .values({ documentId: doc.id, seq: 1, qty: "30", packageTypeCode: "RO" })
      await tx
        .insert(customsTransports)
        .values({ documentId: doc.id, seq: 1, transportModeCode: "1", name: "DEMO VOYAGER" })
      return { doc, line }
    }

    // BC 2.3 Terdaftar.
    const incoming = await insertDocument("23", "5")
    await tx.execute(sql`select refresh_customs_document_status(${incoming.doc.id})`)
    await tx.execute(sql`select submit_customs_document(${incoming.doc.id})`)
    await tx.execute(sql`select register_customs_document(${incoming.doc.id}, '000001',
      (now() at time zone 'Asia/Jakarta')::date)`)

    // Penerimaan yang ditautkan ke BC 2.3, divalidasi lewat gerbang dokumen.
    const [receipt] = await tx
      .insert(transfers)
      .values({
        type: "receipt",
        sourceLocationId: vendor.id,
        destinationLocationId: rack.id,
        partnerId: supplier.id,
        customsDocumentId: incoming.doc.id,
        reference: "PO-DEMO-001",
      })
      .returning()
    const [request] = await tx
      .insert(transferLines)
      .values({
        transferId: receipt.id,
        productId: product.id,
        inputQty: "1500",
        inputUomId: unit.id,
      })
      .returning()
    await tx.insert(stockMoves).values({
      transferId: receipt.id,
      lineId: request.id,
      productId: product.id,
      inputQty: "1500",
      inputUomId: unit.id,
      sourceLocationId: vendor.id,
      destinationLocationId: rack.id,
    })
    await tx.execute(sql`select validate_transfer(${receipt.id})`)

    // BC 2.5 Draft dengan alokasi asal ke BC 2.3.
    const outgoing = await insertDocument("25", "8")
    await tx.execute(
      sql`select allocate_origin(${outgoing.line.id}, ${JSON.stringify([
        { origin_line_id: incoming.line.id, qty: "1500" },
      ])}::jsonb)`,
    )
    await tx.execute(sql`select refresh_customs_document_status(${outgoing.doc.id})`)
  })
  console.log("Data demo dokumen BC dibuat (produk DEMO-KAIN, BC 2.3, penerimaan, BC 2.5).")
}
