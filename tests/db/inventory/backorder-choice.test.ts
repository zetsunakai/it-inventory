import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockMoves,
  transferLines,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, purgeInventory, withLine } from "../../shared/db/helpers"

// Backorder atau buang sisa, dan klasifikasi transaksi (backlog R-08). Data uji berawalan ZBO.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<"pcs" | "product" | "vendor" | "rack" | "partner", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZBOCAT", name: "Unit uji backorder" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZBOPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZBOP", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZBOG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZBOVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZBORAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZBOPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZBO",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.delete(partners).where(eq(partners.code, "ZBOPART"))
  await db.delete(locations).where(like(locations.code, "ZBO%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZBO%"))
  await db.delete(products).where(like(products.sku, "ZBO%"))
  await db.delete(uoms).where(like(uoms.code, "ZBO%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZBO%"))
  await db.$client.end()
})

async function receipt(tx: Tx, qty: string) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
    })
    .returning({ id: transfers.id })
  await tx.insert(stockMoves).values(
    await withLine(tx, {
      transferId: transfer.id,
      productId: ids.product,
      inputQty: qty,
      inputUomId: ids.pcs,
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
    }),
  )
  const [line] = await tx
    .select({ id: transferLines.id })
    .from(transferLines)
    .where(eq(transferLines.transferId, transfer.id))
  return { id: transfer.id, lineId: line.id }
}

async function split(tx: Tx, id: string, done: Record<string, string>, create: boolean) {
  const result = await tx.execute<{ id: string | null }>(
    sql`select split_backorder(${id}, ${JSON.stringify(done)}::jsonb, ${create}) as id`,
  )
  return result.rows[0].id
}

const validate = (tx: Tx, id: string, at?: string) =>
  tx.execute(sql`select validate_transfer(${id}, ${at ?? null}::timestamptz)`)

async function classification(tx: Tx, id: string) {
  const [row] = await tx
    .select({ value: transfers.classification })
    .from(transfers)
    .where(eq(transfers.id, id))
  return row.value
}

test("buang sisa: tidak ada transfer lanjutan, klasifikasi tanpa backorder", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await receipt(tx, "10")
    expect(await split(tx, id, { [lineId]: "6" }, false)).toBeNull()
    await validate(tx, id)
    expect(await classification(tx, id)).toBe("no_backorder")
    expect(await tx.select().from(transfers).where(eq(transfers.backorderOfId, id))).toHaveLength(0)
    const [line] = await tx.select().from(transferLines).where(eq(transferLines.id, lineId))
    expect([line.qty, line.doneQty]).toEqual(["10.0000", "6.0000"])
  })
})

test("backorder: transfer asal dan lanjutannya berklasifikasi backorder", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await receipt(tx, "10")
    const backorder = await split(tx, id, { [lineId]: "6" }, true)
    await validate(tx, id)
    expect(await classification(tx, id)).toBe("backorder")
    await validate(tx, backorder!)
    expect(await classification(tx, backorder!)).toBe("backorder")
  })
})

test("backdate dan transaksi biasa", async () => {
  await inRollback(db, async (tx) => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const late = await receipt(tx, "1")
    await validate(tx, late.id, yesterday)
    expect(await classification(tx, late.id)).toBe("backdate")

    const partial = await receipt(tx, "4")
    await split(tx, partial.id, { [partial.lineId]: "1" }, false)
    await validate(tx, partial.id, yesterday)
    expect(await classification(tx, partial.id)).toBe("backdate_no_backorder")

    const normal = await receipt(tx, "1")
    await validate(tx, normal.id)
    expect(await classification(tx, normal.id)).toBeNull()
  })
})
