import { eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  userWarehouses,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { inventoryDashboard } from "@/modules/inventory/server/queries/dashboard"

import { purgeInventory, todayWib, withLine } from "../../shared/db/helpers"

// Dashboard inventory seperti Inventory Dashboard hmx: tile stok, dokumen aktif, stok per gudang,
// dan transfer aktif terbaru; hanya gudang yang boleh dilihat user. Data uji berawalan ZD.

const ids = {} as Record<
  | "pcs"
  | "product"
  | "emptyProduct"
  | "warehouse"
  | "rack"
  | "vendor"
  | "customer"
  | "scrap"
  | "partner"
  | "gudang"
  | "outsider"
  | "delivery"
  | "scrapTransfer",
  string
>

async function transfer(
  type: "receipt" | "delivery" | "scrap",
  from: string,
  to: string,
  qty: string,
  productId = ids.product,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transfers)
      .values({
        type,
        sourceLocationId: from,
        destinationLocationId: to,
        partnerId: type === "scrap" ? null : ids.partner,
        reason: type === "scrap" ? "Rusak" : null,
        scheduledDate: todayWib(),
      })
      .returning({ id: transfers.id })
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: row.id,
        productId,
        inputQty: qty,
        inputUomId: ids.pcs,
        sourceLocationId: from,
        destinationLocationId: to,
      }),
    )
    return row.id
  })
}

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZDCAT", name: "Unit uji dashboard" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZDPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product, emptyProduct] = await db
    .insert(products)
    .values([
      { sku: "ZDP1", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZDP2", name: "Mur", category: "raw_material", uomId: pcs.id },
    ])
    .returning({ id: products.id })
  ids.product = product.id
  ids.emptyProduct = emptyProduct.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZDG", name: "Gudang dashboard", address: "Bekasi" })
    .returning({ id: warehouses.id })
  ids.warehouse = warehouse.id
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZDRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZDVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZDCUST", name: "Customer", type: "customer" as const },
      { code: "ZDSCRAP", name: "Scrap", type: "scrap" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.rack, ids.vendor, ids.customer, ids.scrap] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZDV",
      name: "Mitra dashboard",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZDV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  // Admin gudang dengan akses gudang uji saja, dan satu tanpa akses gudang mana pun.
  for (const key of ["gudang", "outsider"] as const) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${key}`, email: `zd-${key}@dashboard.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role: "admin_gudang" })
    ids[key] = user.id
  }
  await db.insert(userWarehouses).values({ userId: ids.gudang, warehouseId: ids.warehouse })

  // Baut: stok 5, pengiriman 8 memesan semuanya (Sebagian tersedia), scrap 1 menunggu stok.
  // Mur: masuk 3 lalu keluar 3, jadi baris saldonya 0 (stok habis).
  const receipt = await transfer("receipt", ids.vendor, ids.rack, "5")
  await db.execute(sql`select validate_transfer(${receipt})`)
  const nutIn = await transfer("receipt", ids.vendor, ids.rack, "3", ids.emptyProduct)
  await db.execute(sql`select validate_transfer(${nutIn})`)
  const nutOut = await transfer("delivery", ids.rack, ids.customer, "3", ids.emptyProduct)
  await db.execute(sql`select confirm_transfer(${nutOut})`)
  await db.execute(sql`select validate_transfer(${nutOut})`)
  ids.delivery = await transfer("delivery", ids.rack, ids.customer, "8")
  await db.execute(sql`select confirm_transfer(${ids.delivery})`)
  ids.scrapTransfer = await transfer("scrap", ids.rack, ids.scrap, "1")
  await db.execute(sql`select confirm_transfer(${ids.scrapTransfer})`)
})

afterAll(async () => {
  await purgeInventory(db, [ids.product, ids.emptyProduct])
  await db.delete(userWarehouses).where(eq(userWarehouses.userId, ids.gudang))
  await db.delete(users).where(like(users.email, "zd-%@dashboard.test"))
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZD%"))
  await db.delete(warehouses).where(inArray(warehouses.id, [ids.warehouse]))
  await db.delete(products).where(inArray(products.id, [ids.product, ids.emptyProduct]))
  await db.delete(uoms).where(like(uoms.code, "ZD%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZD%"))
  await db.$client.end()
})

test("tile stok dan dokumen aktif seperti dashboard hmx", async () => {
  const data = await inventoryDashboard(ids.gudang)
  expect(Number(data.onHand.qty)).toBe(5)
  expect(data.onHand.products).toBe(1)
  // Semua stok Baut dipesan pengiriman, jadi tidak ada yang tersedia.
  expect(Number(data.available.qty)).toBe(0)
  expect(data.available.products).toBe(0)
  expect(data.outOfStock).toBe(1)
  expect(data.negative).toBe(0)
  expect(data.activeDocuments).toEqual({ waiting: 1, partial: 1, ready: 0 })
})

test("stok per gudang dan transfer aktif terbaru", async () => {
  const data = await inventoryDashboard(ids.gudang)
  expect(data.warehouses).toEqual([
    expect.objectContaining({ id: ids.warehouse, code: "ZDG", qty: "5.0000" }),
  ])
  expect(data.recent.total).toBe(2)
  expect(data.recent.rows.map((row) => [row.id, row.movementCode, row.status])).toEqual([
    [ids.scrapTransfer, "pu", "waiting"],
    [ids.delivery, "gi", "partially_available"],
  ])
})

test("user tanpa akses gudang tidak melihat apa pun", async () => {
  const data = await inventoryDashboard(ids.outsider)
  expect(data.onHand).toEqual({ qty: "0", products: 0 })
  expect(data.outOfStock).toBe(0)
  expect(data.activeDocuments).toEqual({ waiting: 0, partial: 0, ready: 0 })
  expect(data.warehouses).toEqual([])
  expect(data.recent).toEqual({ total: 0, rows: [] })
})
