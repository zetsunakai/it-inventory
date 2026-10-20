import { eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockCounts,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { attentionItems } from "@/modules/inventory/server/queries/home"

import { purgeInventory, withLine } from "./helpers"

// Beranda "Perlu perhatian" untuk inventory (backlog RU-01). Data uji berawalan ZH.

const ids = {} as Record<
  | "pcs"
  | "product"
  | "warehouse"
  | "rack"
  | "vendor"
  | "customer"
  | "scrap"
  | "partner"
  | "manajer"
  | "gudang"
  | "count",
  string
>

async function transfer(
  type: "receipt" | "delivery" | "scrap",
  from: string,
  to: string,
  qty: string,
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
        scheduledDate: "2026-10-15",
      })
      .returning({ id: transfers.id })
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: row.id,
        productId: ids.product,
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
    .values({ code: "ZHCAT", name: "Unit uji beranda" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZHPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZHP1", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({
      code: "ZHG",
      name: "ZHG",
      address: "Bekasi",
    })
    .returning({ id: warehouses.id })
  ids.warehouse = warehouse.id
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZHRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZHVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZHCUST", name: "Customer", type: "customer" as const },
      { code: "ZHSCRAP", name: "Scrap", type: "scrap" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.rack, ids.vendor, ids.customer, ids.scrap] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZHV",
      name: "Mitra beranda",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZHV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  for (const [key, role] of [
    ["manajer", "manajer"],
    ["gudang", "admin_gudang"],
  ] as const) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zh-${role}@beranda.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    ids[key] = user.id
  }

  // Stok 5; pengiriman 8 hanya sebagian tersedia; scrap 1 menunggu stok dan persetujuan.
  const receipt = await transfer("receipt", ids.vendor, ids.rack, "5")
  await db.execute(sql`select validate_transfer(${receipt})`)
  const delivery = await transfer("delivery", ids.rack, ids.customer, "8")
  await db.execute(sql`select confirm_transfer(${delivery})`)
  const scrap = await transfer("scrap", ids.rack, ids.scrap, "1")
  await db.execute(sql`select confirm_transfer(${scrap})`)
  // Opname berjalan membekukan gudang.
  const [count] = await db
    .insert(stockCounts)
    .values({ status: "draft", warehouseId: warehouse.id })
    .returning({ id: stockCounts.id })
  ids.count = count.id
  await db.execute(sql`select start_stock_count(${count.id})`)
})

afterAll(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx.execute(sql`delete from stock_count_lines where stock_count_id = ${ids.count}`)
    await tx.delete(stockCounts).where(eq(stockCounts.id, ids.count))
  })
  await purgeInventory(db, [ids.product])
  await db.delete(users).where(like(users.email, "zh-%@beranda.test"))
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZH%"))
  await db.delete(warehouses).where(inArray(warehouses.id, [ids.warehouse]))
  await db.delete(products).where(eq(products.id, ids.product))
  await db.delete(uoms).where(like(uoms.code, "ZH%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZH%"))
  await db.$client.end()
})

test("Manajer melihat transfer menunggu stok, persetujuan, dan gudang yang dibekukan opname", async () => {
  const items = await attentionItems({ id: ids.manajer, roles: ["manajer"] })
  const titles = items.map((item) => item.title)
  // Data tes lain bisa ikut terhitung, jadi yang dicek bentuk dan tujuannya.
  expect(titles).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/^\d+ pengiriman menunggu stok$/),
      expect.stringMatching(/^\d+ pemakaian menunggu persetujuan$/),
      expect.stringMatching(/^\d+ gudang dibekukan untuk stock opname$/),
    ]),
  )
  const frozen = items.find((item) => item.title.endsWith("dibekukan untuk stock opname"))
  expect(frozen?.detail).toContain("ZHG (OPN/")
  expect(items.find((item) => item.title.endsWith("pengiriman menunggu stok"))?.href).toBe(
    "/inventory/pengiriman",
  )
  expect(items.find((item) => item.title.endsWith("menunggu persetujuan"))).toMatchObject({
    href: "/inventory/scrap?antrean=persetujuan",
    label: "Persetujuan",
  })
})

test("admin gudang tanpa akses gudang tidak melihat pekerjaan gudang itu; tanpa persetujuan", async () => {
  const items = await attentionItems({ id: ids.gudang, roles: ["admin_gudang"] })
  expect(items.some((item) => item.detail.includes("ZHG"))).toBe(false)
  expect(items.some((item) => item.title.endsWith("menunggu persetujuan"))).toBe(false)
})
