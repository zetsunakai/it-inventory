import { and, eq, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  lots,
  partners,
  products,
  stockBalances,
  stockMoves,
  transferLines,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, pgErrorInSavepoint, purgeInventory, withLine } from "./helpers"

// Reservasi stok (backlog R-07). Semua data uji berawalan ZRV.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  "pcs" | "product" | "lotProduct" | "vendor" | "customer" | "rack" | "partner",
  string
>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZRVCAT", name: "Unit uji reservasi" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZRVPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product, lotProduct] = await db
    .insert(products)
    .values([
      { sku: "ZRVP", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZRVL", name: "Cat", category: "raw_material", uomId: pcs.id, tracking: "lot" },
    ])
    .returning({ id: products.id })
  ids.product = product.id
  ids.lotProduct = lotProduct.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZRVG", name: "Gudang", address: "Bekasi", isBonded: true, category: "wip" })
    .returning({ id: warehouses.id })
  const [vendor, customer, rack] = await db
    .insert(locations)
    .values([
      { code: "ZRVVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZRVCUST", name: "Customer", type: "customer" as const },
      { code: "ZRVRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.customer = customer.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZRVPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZRV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterEach(() => purgeInventory(db, [ids.product, ids.lotProduct]))

afterAll(async () => {
  await db.delete(partners).where(eq(partners.code, "ZRVPART"))
  await db.delete(locations).where(like(locations.code, "ZRV%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZRV%"))
  await db.delete(products).where(like(products.sku, "ZRV%"))
  await db.delete(uoms).where(like(uoms.code, "ZRV%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZRV%"))
  await db.$client.end()
})

type Line = { product?: string; qty: string; lot?: string }

async function lotId(tx: Tx, product: string, name: string) {
  const [existing] = await tx
    .select({ id: lots.id })
    .from(lots)
    .where(and(eq(lots.productId, product), eq(lots.name, name)))
  if (existing) return existing.id
  const [row] = await tx
    .insert(lots)
    .values({ productId: product, name })
    .returning({ id: lots.id })
  return row.id
}

async function draft(tx: Tx, type: "receipt" | "delivery", lines: Line[]) {
  const [from, to] = type === "receipt" ? [ids.vendor, ids.rack] : [ids.rack, ids.customer]
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      partnerId: ids.partner,
      scheduledDate: "2026-10-15",
    })
    .returning({ id: transfers.id })
  for (const line of lines) {
    const productId = line.product ?? ids.product
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: transfer.id,
        productId,
        lotId: line.lot ? await lotId(tx, productId, line.lot) : null,
        inputQty: line.qty,
        inputUomId: ids.pcs,
        sourceLocationId: from,
        destinationLocationId: to,
      }),
    )
  }
  return transfer.id
}

const receive = async (tx: Tx, lines: Line[]) =>
  tx.execute(sql`select validate_transfer(${await draft(tx, "receipt", lines)})`)

const fn = async (tx: Tx, name: string, id: string) =>
  (await tx.execute<{ result: string }>(sql`select ${sql.raw(name)}(${id})::text as result`))
    .rows[0].result

async function reserved(tx: Tx, productId = ids.product) {
  const rows = await tx
    .select({ qty: stockBalances.qty, reserved: stockBalances.reservedQty })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.locationId, ids.rack)))
  return rows.reduce((sum, row) => sum + Number(row.reserved), 0)
}

test("pesanan transfer lain mengurangi stok tersedia; Batal melepasnya", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, [{ qty: "10" }])
    const first = await draft(tx, "delivery", [{ qty: "6" }])
    const second = await draft(tx, "delivery", [{ qty: "6" }])
    expect(await fn(tx, "confirm_transfer", first)).toBe("ready")
    expect(await fn(tx, "confirm_transfer", second)).toBe("partially_available")
    expect(await reserved(tx)).toBe(10)

    // Validasi transfer kedua ditolak: stok yang dipesan transfer pertama tidak tersedia.
    expect(await pgErrorInSavepoint(tx, (sp) => fn(sp, "validate_transfer", second))).toBe(
      "Stok ZRVP di ZRVRAK tidak cukup: tersedia 4, dibutuhkan 6.",
    )

    await tx.execute(sql`select cancel_transfer(${first})`)
    expect(await reserved(tx)).toBe(4)
    expect(await fn(tx, "check_transfer_availability", second)).toBe("ready")
    expect(await reserved(tx)).toBe(6)
    await tx.execute(sql`select validate_transfer(${second})`)
    expect(await reserved(tx)).toBe(0)
  })
})

test("lot terlama dipesan dulu; pergerakan dipecah per lot", async () => {
  await inRollback(db, async (tx) => {
    // Lot dibuat di transaksi berbeda di pemakaian nyata; di sini waktunya diisi eksplisit.
    await tx.insert(lots).values([
      { productId: ids.lotProduct, name: "L-LAMA", createdAt: new Date("2026-01-01") },
      { productId: ids.lotProduct, name: "L-BARU", createdAt: new Date("2026-06-01") },
    ])
    await receive(tx, [{ product: ids.lotProduct, qty: "3", lot: "L-LAMA" }])
    await receive(tx, [{ product: ids.lotProduct, qty: "5", lot: "L-BARU" }])
    const delivery = await draft(tx, "delivery", [{ product: ids.lotProduct, qty: "6" }])
    expect(await fn(tx, "confirm_transfer", delivery)).toBe("ready")
    const moves = await tx
      .select({ lot: lots.name, qty: stockMoves.qty, reserved: stockMoves.reservedQty })
      .from(stockMoves)
      .innerJoin(lots, eq(lots.id, stockMoves.lotId))
      .where(eq(stockMoves.transferId, delivery))
      .orderBy(lots.createdAt)
    expect(moves).toEqual([
      { lot: "L-LAMA", qty: "3.0000", reserved: "3.0000" },
      { lot: "L-BARU", qty: "3.0000", reserved: "3.0000" },
    ])
    await tx.execute(sql`select validate_transfer(${delivery})`)
    expect(await reserved(tx, ids.lotProduct)).toBe(0)
  })
})

test("Lepas reservasi mengembalikan stok dan status Menunggu", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, [{ qty: "4" }])
    const delivery = await draft(tx, "delivery", [{ qty: "4" }])
    await fn(tx, "confirm_transfer", delivery)
    await tx.execute(sql`select release_transfer_reservation(${delivery})`)
    expect(await reserved(tx)).toBe(0)
    const [row] = await tx
      .select({ status: transfers.status })
      .from(transfers)
      .where(eq(transfers.id, delivery))
    expect(row.status).toBe("waiting")
  })
})

test("dua transfer yang dikonfirmasi bersamaan tidak memesan stok yang sama", async () => {
  await db.transaction(async (tx) => receive(tx, [{ qty: "10" }]))
  const [a, b] = await Promise.all([
    db.transaction((tx) => draft(tx, "delivery", [{ qty: "7" }])),
    db.transaction((tx) => draft(tx, "delivery", [{ qty: "7" }])),
  ])
  const statuses = await Promise.all(
    [a, b].map((id) => db.transaction((tx) => fn(tx, "confirm_transfer", id))),
  )
  expect(statuses.toSorted()).toEqual(["partially_available", "ready"])
  const [balance] = await db
    .select({ reserved: stockBalances.reservedQty })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, ids.product), eq(stockBalances.locationId, ids.rack)))
  expect(balance.reserved).toBe("10.0000")
})

test("validasi parsial transfer yang memesan stok: sisa ke lanjutan, pesanan tidak tertinggal", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, [{ qty: "10" }])
    const id = await draft(tx, "delivery", [{ qty: "6" }])
    expect(await fn(tx, "confirm_transfer", id)).toBe("ready")
    const [line] = await tx
      .select({ id: transferLines.id })
      .from(transferLines)
      .where(eq(transferLines.transferId, id))
    await tx.execute(
      sql`select split_backorder(${id}, ${JSON.stringify({ [line.id]: "4" })}::jsonb, true)`,
    )
    await tx.execute(sql`select validate_transfer(${id})`)
    const [balance] = await tx
      .select({ qty: stockBalances.qty, reserved: stockBalances.reservedQty })
      .from(stockBalances)
      .where(and(eq(stockBalances.productId, ids.product), eq(stockBalances.locationId, ids.rack)))
    expect(balance).toEqual({ qty: "6.0000", reserved: "0.0000" })
  })
})
