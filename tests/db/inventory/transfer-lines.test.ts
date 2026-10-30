import { and, eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

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

import { inRollback, pgErrorInSavepoint, purgeInventory } from "../../shared/db/helpers"

// Baris permintaan transfer (backlog R-05). Semua data uji berawalan ZL.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<"pcs" | "product" | "other" | "vendor" | "rack" | "partner", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZLCAT", name: "Unit uji baris" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZLPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product, other] = await db
    .insert(products)
    .values([
      { sku: "ZLP", name: "Cat", category: "raw_material", uomId: pcs.id, tracking: "lot" },
      { sku: "ZLQ", name: "Lem", category: "raw_material", uomId: pcs.id },
    ])
    .returning({ id: products.id })
  ids.product = product.id
  ids.other = other.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZLG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZLVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZLRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZLPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZL",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.product, ids.other])
  await db.delete(partners).where(eq(partners.code, "ZLPART"))
  await db.delete(locations).where(like(locations.code, "ZL%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZL%"))
  await db.delete(products).where(like(products.sku, "ZL%"))
  await db.delete(uoms).where(like(uoms.code, "ZL%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZL%"))
  await db.$client.end()
})

// Penerimaan Draft dengan satu baris permintaan dan pergerakan per lot yang diberikan.
async function receipt(tx: Tx, demand: string, moves: { qty: string; lot?: string }[]) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
    })
    .returning({ id: transfers.id })
  const [line] = await tx
    .insert(transferLines)
    .values({
      transferId: transfer.id,
      productId: ids.product,
      inputQty: demand,
      inputUomId: ids.pcs,
    })
    .returning({ id: transferLines.id })
  for (const move of moves) {
    const [lot] = move.lot
      ? await tx
          .insert(lots)
          .values({ productId: ids.product, name: move.lot })
          .returning({ id: lots.id })
      : [undefined]
    await tx.insert(stockMoves).values({
      transferId: transfer.id,
      lineId: line.id,
      productId: ids.product,
      lotId: lot?.id ?? null,
      inputQty: move.qty,
      inputUomId: ids.pcs,
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
    })
  }
  return { transferId: transfer.id, lineId: line.id }
}

const validate = (tx: Tx, id: string) => tx.execute(sql`select validate_transfer(${id})`)

test("satu baris diselesaikan dengan beberapa lot; qty selesai = jumlah pergerakannya", async () => {
  await inRollback(db, async (tx) => {
    const { transferId, lineId } = await receipt(tx, "10", [
      { qty: "6", lot: "A-1" },
      { qty: "4", lot: "A-2" },
    ])
    await validate(tx, transferId)
    const [line] = await tx
      .select({ qty: transferLines.qty, doneQty: transferLines.doneQty })
      .from(transferLines)
      .where(eq(transferLines.id, lineId))
    expect(line).toEqual({ qty: "10.0000", doneQty: "10.0000" })
    const balances = await tx
      .select({ lot: lots.name, qty: stockBalances.qty })
      .from(stockBalances)
      .innerJoin(lots, eq(lots.id, stockBalances.lotId))
      .where(and(eq(stockBalances.productId, ids.product), eq(stockBalances.locationId, ids.rack)))
      .orderBy(lots.name)
    expect(balances).toEqual([
      { lot: "A-1", qty: "6.0000" },
      { lot: "A-2", qty: "4.0000" },
    ])
  })
})

test("qty pergerakan melebihi qty diminta ditolak", async () => {
  await inRollback(db, async (tx) => {
    const { transferId } = await receipt(tx, "10", [
      { qty: "8", lot: "B-1" },
      { qty: "4", lot: "B-2" },
    ])
    expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, transferId))).toBe(
      "Qty selesai ZLP (12) melebihi qty diminta (10 ZLPCS).",
    )
  })
})

test("sisa baris tanpa pergerakan menjadi transfer lanjutan", async () => {
  await inRollback(db, async (tx) => {
    const { transferId } = await receipt(tx, "10", [{ qty: "7", lot: "C-1" }])
    const [{ id: backorderId }] = (
      await tx.execute<{ id: string }>(
        sql`select split_backorder(${transferId}, '{}'::jsonb) as id`,
      )
    ).rows
    await validate(tx, transferId)
    const rest = await tx
      .select({ qty: transferLines.qty, lot: lots.name })
      .from(transferLines)
      .innerJoin(stockMoves, eq(stockMoves.lineId, transferLines.id))
      .innerJoin(lots, eq(lots.id, stockMoves.lotId))
      .where(eq(transferLines.transferId, backorderId))
    expect(rest).toEqual([{ qty: "3.0000", lot: "C-1" }])
  })
})

test("pergerakan harus sesuai produk barisnya; baris transfer Selesai terkunci", async () => {
  await inRollback(db, async (tx) => {
    const { transferId, lineId } = await receipt(tx, "5", [{ qty: "5", lot: "D-1" }])
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.insert(stockMoves).values({
          transferId,
          lineId,
          productId: ids.other,
          inputQty: "1",
          inputUomId: ids.pcs,
          sourceLocationId: ids.vendor,
          destinationLocationId: ids.rack,
        }),
      ),
    ).toBe("Baris pergerakan ZLQ tidak sesuai baris permintaannya.")
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.update(transferLines).set({ doneQty: "5" }).where(eq(transferLines.id, lineId)),
      ),
    ).toBe("Qty selesai hanya diisi saat validasi transfer.")

    await validate(tx, transferId)
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.update(transferLines).set({ inputQty: "9" }).where(eq(transferLines.id, lineId)),
      ),
    ).toBe("Baris barang transfer yang sudah Selesai tidak bisa diubah.")
  })
})
