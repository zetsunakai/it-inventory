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

import { inRollback, pgErrorInSavepoint, purgeInventory, todayWib, withLine } from "./helpers"

// Reservasi pengiriman dari sub-lokasi dengan FIFO tanggal masuk dan rincian lot pengiriman
// (backlog I-01). Data uji berawalan ZDR. Lokasi: ZDRSTK (induk) dengan rak ZDRRA dan ZDRRB.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  | "pcs"
  | "product"
  | "lotProduct"
  | "vendor"
  | "customer"
  | "stock"
  | "rackA"
  | "rackB"
  | "partner",
  string
>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZDRCAT", name: "Unit uji pengiriman" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZDRPCS",
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
      { sku: "ZDRP", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZDRL", name: "Cat", category: "raw_material", uomId: pcs.id, tracking: "lot" },
    ])
    .returning({ id: products.id })
  ids.product = product.id
  ids.lotProduct = lotProduct.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZDRG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, customer, stock] = await db
    .insert(locations)
    .values([
      { code: "ZDRVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZDRCUST", name: "Customer", type: "customer" as const },
      { code: "ZDRSTK", name: "Stok", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  const [rackA, rackB] = await db
    .insert(locations)
    .values([
      {
        code: "ZDRRA",
        name: "Rak A",
        type: "internal" as const,
        warehouseId: warehouse.id,
        parentId: stock.id,
      },
      {
        code: "ZDRRB",
        name: "Rak B",
        type: "internal" as const,
        warehouseId: warehouse.id,
        parentId: stock.id,
      },
    ])
    .returning({ id: locations.id })
  Object.assign(ids, {
    vendor: vendor.id,
    customer: customer.id,
    stock: stock.id,
    rackA: rackA.id,
    rackB: rackB.id,
  })
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZDRPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZDR",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterEach(() => purgeInventory(db, [ids.product, ids.lotProduct]))

afterAll(async () => {
  await db.delete(partners).where(eq(partners.code, "ZDRPART"))
  await db.delete(locations).where(like(locations.code, "ZDRR%"))
  await db.delete(locations).where(like(locations.code, "ZDR%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZDR%"))
  await db.delete(products).where(like(products.sku, "ZDR%"))
  await db.delete(uoms).where(like(uoms.code, "ZDR%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZDR%"))
  await db.$client.end()
})

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

async function transfer(
  tx: Tx,
  type: "receipt" | "delivery",
  location: string,
  productId: string,
  qty: string,
  lot?: string,
) {
  const [from, to] = type === "receipt" ? [ids.vendor, location] : [location, ids.customer]
  const [row] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      partnerId: ids.partner,
      scheduledDate: todayWib(),
    })
    .returning({ id: transfers.id })
  await tx.insert(stockMoves).values(
    await withLine(tx, {
      transferId: row.id,
      productId,
      lotId: lot ? await lotId(tx, productId, lot) : null,
      inputQty: qty,
      inputUomId: ids.pcs,
      sourceLocationId: from,
      destinationLocationId: to,
    }),
  )
  return row.id
}

async function receive(tx: Tx, rack: string, productId: string, qty: string, lot?: string) {
  const id = await transfer(tx, "receipt", rack, productId, qty, lot)
  await tx.execute(sql`select validate_transfer(${id})`)
}

const confirm = async (tx: Tx, id: string) =>
  (await tx.execute<{ status: string }>(sql`select confirm_transfer(${id}) as status`)).rows[0]
    .status

async function movesOf(tx: Tx, id: string) {
  return (
    tx
      .select({
        location: locations.code,
        lot: lots.name,
        qty: stockMoves.qty,
        reserved: stockMoves.reservedQty,
      })
      .from(stockMoves)
      .innerJoin(locations, eq(locations.id, stockMoves.sourceLocationId))
      .leftJoin(lots, eq(lots.id, stockMoves.lotId))
      .where(eq(stockMoves.transferId, id))
      // Dalam satu transaksi created_at sama (now()), jadi urutan kedua lot (tanpa lot terakhir)
      // supaya hasilnya tidak acak.
      .orderBy(stockMoves.createdAt, sql`${lots.name} nulls last`)
  )
}

async function lineOf(tx: Tx, id: string) {
  const [line] = await tx.select().from(transferLines).where(eq(transferLines.transferId, id))
  return line
}

const setMoves = (tx: Tx, lineId: string, moves: { lot: string | null; qty: string }[]) =>
  tx.execute(sql`select set_delivery_line_moves(${lineId}, ${JSON.stringify(moves)}::jsonb)`)

async function reservedTotal(tx: Tx, productId: string) {
  const rows = await tx
    .select({ reserved: stockBalances.reservedQty })
    .from(stockBalances)
    .where(eq(stockBalances.productId, productId))
  return rows.reduce((sum, row) => sum + Number(row.reserved), 0)
}

test("pengiriman dari lokasi induk memesan stok di rak anaknya", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, ids.rackA, ids.product, "4")
    await receive(tx, ids.rackB, ids.product, "6")
    const delivery = await transfer(tx, "delivery", ids.stock, ids.product, "8")
    expect(await confirm(tx, delivery)).toBe("ready")
    // Rak A diisi lebih dulu, jadi dipesan lebih dulu.
    expect(await movesOf(tx, delivery)).toEqual([
      { location: "ZDRRA", lot: null, qty: "4.0000", reserved: "4.0000" },
      { location: "ZDRRB", lot: null, qty: "4.0000", reserved: "4.0000" },
    ])
    await tx.execute(sql`select validate_transfer(${delivery})`)
    expect((await lineOf(tx, delivery)).doneQty).toBe("8.0000")
    expect(await reservedTotal(tx, ids.product)).toBe(0)
  })
})

test("FIFO tanggal masuk, bukan tanggal lot dibuat; sisa tanpa stok tetap di lokasi asal", async () => {
  await inRollback(db, async (tx) => {
    // Lot B dibuat lebih dulu tapi barangnya masuk belakangan.
    await lotId(tx, ids.lotProduct, "ZDR-B")
    await receive(tx, ids.rackA, ids.lotProduct, "3", "ZDR-A")
    await receive(tx, ids.rackB, ids.lotProduct, "3", "ZDR-B")
    const delivery = await transfer(tx, "delivery", ids.stock, ids.lotProduct, "8")
    expect(await confirm(tx, delivery)).toBe("partially_available")
    expect(await movesOf(tx, delivery)).toEqual([
      { location: "ZDRRA", lot: "ZDR-A", qty: "3.0000", reserved: "3.0000" },
      { location: "ZDRRB", lot: "ZDR-B", qty: "3.0000", reserved: "3.0000" },
      { location: "ZDRSTK", lot: null, qty: "2.0000", reserved: "0.0000" },
    ])
  })
})

test("rincian lot pengiriman: 2 lot sebagian, sisanya jadi backorder", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, ids.rackA, ids.lotProduct, "5", "ZDR-A")
    await receive(tx, ids.rackB, ids.lotProduct, "5", "ZDR-B")
    const delivery = await transfer(tx, "delivery", ids.stock, ids.lotProduct, "10")
    expect(await confirm(tx, delivery)).toBe("ready")
    const line = await lineOf(tx, delivery)
    await setMoves(tx, line.id, [
      { lot: "ZDR-B", qty: "4" },
      { lot: "ZDR-A", qty: "3" },
    ])
    expect(await reservedTotal(tx, ids.lotProduct)).toBe(7)
    const split = await tx.execute<{ id: string }>(
      sql`select split_backorder(${delivery}, '{}'::jsonb, true) as id`,
    )
    await tx.execute(sql`select validate_transfer(${delivery})`)
    expect((await lineOf(tx, delivery)).doneQty).toBe("7.0000")
    expect((await lineOf(tx, split.rows[0].id)).inputQty).toBe("3.0000")
    // Sisa dipesan lagi dari lokasi asal transfer (induk), bukan dari rak pergerakan pertama.
    expect(await movesOf(tx, split.rows[0].id)).toEqual([
      { location: "ZDRSTK", lot: null, qty: "3.0000", reserved: "0.0000" },
    ])
    const balances = await tx
      .select({ lot: lots.name, qty: stockBalances.qty })
      .from(stockBalances)
      .innerJoin(lots, eq(lots.id, stockBalances.lotId))
      .where(
        and(
          eq(stockBalances.productId, ids.lotProduct),
          eq(
            stockBalances.warehouseId,
            sql`(
          select warehouse_id from locations where id = ${ids.stock}
        )`,
          ),
        ),
      )
      .orderBy(lots.name)
    expect(balances).toEqual([
      { lot: "ZDR-A", qty: "2.0000" },
      { lot: "ZDR-B", qty: "1.0000" },
    ])
    expect(await reservedTotal(tx, ids.lotProduct)).toBe(0)
  })
})

test("kesalahan rincian lot pengiriman dilaporkan sekaligus, pesanan lama tetap", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, ids.rackA, ids.lotProduct, "2", "ZDR-A")
    await receive(tx, ids.rackB, ids.lotProduct, "2", "ZDR-B")
    const delivery = await transfer(tx, "delivery", ids.stock, ids.lotProduct, "3")
    await confirm(tx, delivery)
    const line = await lineOf(tx, delivery)
    const message = await pgErrorInSavepoint(tx, (sp) =>
      setMoves(sp, line.id, [
        { lot: "ZDR-A", qty: "3" },
        { lot: "ZDR-X", qty: "1" },
        { lot: "ZDR-B", qty: "1" },
        { lot: "ZDR-B", qty: "1" },
      ]),
    )
    expect(message).toContain("ZDR-A: stok tersedia 2, dikirim 3.")
    expect(message).toContain("Lot ZDR-X tidak ada untuk produk ZDRL.")
    expect(message).toContain("Lot ZDR-B tercatat dua kali.")
    expect(message).toContain("Qty dikirim 6 melebihi qty diminta 3.")
    expect(await reservedTotal(tx, ids.lotProduct)).toBe(3)
  })
})
