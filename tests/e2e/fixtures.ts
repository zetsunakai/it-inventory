import { eq, sql } from "drizzle-orm"

import { createDb } from "@/server/db/client"
import {
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../test-env"

// Data master untuk tes transaksi (M2), langsung ke database tes supaya setiap tes mandiri dan
// tidak bergantung pada urutan tes lain. Kode diberi akhiran unik per run.
export async function createInventoryFixture(prefix: string) {
  const suffix = Date.now().toString(36).slice(-5).toUpperCase()
  const code = (name: string) => `${prefix}${name}-${suffix}`
  const { db, pool } = createDb(TEST_DATABASE_URL)
  try {
    const [pcs] = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "PCS"))
    const [warehouse] = await db
      .insert(warehouses)
      .values({
        code: code("G"),
        name: `Gudang ${prefix}`,
        address: "Kawasan Berikat, Bekasi",
        isBonded: true,
        category: "raw_material",
      })
      .returning({ id: warehouses.id, code: warehouses.code })
    const [rack] = await db
      .insert(locations)
      .values({ code: code("R"), name: "Rak A", type: "internal", warehouseId: warehouse.id })
      .returning({ id: locations.id, code: locations.code })
    const [partner] = await db
      .insert(partners)
      .values({
        code: code("V"),
        name: `PT ${prefix} Mitra ${suffix}`,
        address: "Bekasi",
        countryCode: "ID",
        isVendor: true,
        isCustomer: true,
        identityType: "other",
        identityNumber: code("V"),
      })
      .returning({ id: partners.id, code: partners.code, name: partners.name })
    const [product] = await db
      .insert(products)
      .values({ sku: code("P"), name: `Baut ${prefix}`, category: "raw_material", uomId: pcs.id })
      .returning({ id: products.id, sku: products.sku })
    return { warehouse, rack, partner, product }
  } finally {
    await pool.end()
  }
}

// Saldo produk di satu lokasi, untuk memastikan hasil validasi.
export async function stockAt(productId: string, locationId: string) {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  try {
    const result = await db.execute<{ qty: string | null }>(
      sql`select sum(qty)::text as qty from stock_balances
          where product_id = ${productId} and location_id = ${locationId}`,
    )
    return Number(result.rows[0]?.qty ?? 0)
  } finally {
    await pool.end()
  }
}

// Stok awal lewat penerimaan yang langsung divalidasi (dari lokasi VENDOR hasil seed).
export async function receiveStock(
  fixture: Awaited<ReturnType<typeof createInventoryFixture>>,
  qty: string,
) {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  try {
    await db.transaction(async (tx) => {
      const [vendor] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.code, "VENDOR"))
      const [pcs] = await tx.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "PCS"))
      const [transfer] = await tx
        .insert(transfers)
        .values({
          type: "receipt",
          sourceLocationId: vendor.id,
          destinationLocationId: fixture.rack.id,
          partnerId: fixture.partner.id,
        })
        .returning({ id: transfers.id })
      await tx.insert(stockMoves).values({
        transferId: transfer.id,
        productId: fixture.product.id,
        inputQty: qty,
        inputUomId: pcs.id,
        sourceLocationId: vendor.id,
        destinationLocationId: fixture.rack.id,
      })
      await tx.execute(sql`select validate_transfer(${transfer.id})`)
    })
  } finally {
    await pool.end()
  }
}
