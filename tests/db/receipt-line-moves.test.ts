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

import { inRollback, pgErrorInSavepoint, purgeInventory, todayWib, withLine } from "./helpers"

// Rincian lot/nomor seri per baris penerimaan (backlog RU-03). Data uji berawalan ZRL.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<"pcs" | "lot" | "serial" | "auto" | "vendor" | "rack" | "partner", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZRLCAT", name: "Unit uji rincian lot" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZRLPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [lot, serial, auto] = await db
    .insert(products)
    .values([
      { sku: "ZRLL", name: "Kabel", category: "raw_material", uomId: pcs.id, tracking: "lot" },
      { sku: "ZRLS", name: "Router", category: "raw_material", uomId: pcs.id, tracking: "serial" },
      {
        sku: "ZRLA",
        name: "Sekrup",
        category: "raw_material",
        uomId: pcs.id,
        tracking: "lot",
        lotAuto: true,
      },
    ] as const)
    .returning({ id: products.id })
  Object.assign(ids, { lot: lot.id, serial: serial.id, auto: auto.id })
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZRLG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZRLVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZRLRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZRLPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZRL",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.lot, ids.serial, ids.auto])
  await db.delete(partners).where(eq(partners.code, "ZRLPART"))
  await db.delete(locations).where(like(locations.code, "ZRL%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZRL%"))
  await db.delete(products).where(like(products.sku, "ZRL%"))
  await db.delete(uoms).where(like(uoms.code, "ZRL%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZRL%"))
  await db.$client.end()
})

// Penerimaan Siap dengan satu baris tanpa lot.
async function readyReceipt(tx: Tx, productId: string, qty: string) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
      scheduledDate: todayWib(),
    })
    .returning({ id: transfers.id })
  await tx.insert(stockMoves).values(
    await withLine(tx, {
      transferId: transfer.id,
      productId,
      inputQty: qty,
      inputUomId: ids.pcs,
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
    }),
  )
  await tx.execute(sql`select confirm_transfer(${transfer.id})`)
  const [line] = await tx
    .select({ id: transferLines.id })
    .from(transferLines)
    .where(eq(transferLines.transferId, transfer.id))
  return { id: transfer.id, lineId: line.id }
}

const setMoves = (tx: Tx, lineId: string, moves: { lot: string | null; qty: string }[]) =>
  tx.execute(sql`select set_receipt_line_moves(${lineId}, ${JSON.stringify(moves)}::jsonb)`)

async function balanceOf(tx: Tx, productId: string, lotName: string) {
  const [row] = await tx
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .innerJoin(lots, eq(lots.id, stockBalances.lotId))
    .where(
      and(
        eq(stockBalances.productId, productId),
        eq(stockBalances.locationId, ids.rack),
        eq(lots.name, lotName),
      ),
    )
  return row?.qty
}

test("penerimaan parsial dengan 2 lot: qty selesai = jumlah rincian, sisa jadi backorder", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await readyReceipt(tx, ids.lot, "10")
    await setMoves(tx, lineId, [
      { lot: "ZRL-A", qty: "4" },
      { lot: "ZRL-B", qty: "3" },
    ])
    const split = await tx.execute<{ id: string }>(
      sql`select split_backorder(${id}, '{}'::jsonb, true) as id`,
    )
    const backorderId = split.rows[0].id
    await tx.execute(sql`select validate_transfer(${id}, null)`)

    const [line] = await tx.select().from(transferLines).where(eq(transferLines.id, lineId))
    expect(line.doneQty).toBe("7.0000")
    expect(await balanceOf(tx, ids.lot, "ZRL-A")).toBe("4.0000")
    expect(await balanceOf(tx, ids.lot, "ZRL-B")).toBe("3.0000")
    const [rest] = await tx
      .select({ qty: transferLines.inputQty })
      .from(transferLines)
      .where(eq(transferLines.transferId, backorderId))
    expect(rest.qty).toBe("3.0000")
    // Lot sisa belum diketahui: tidak mewarisi lot rincian pertama.
    const [restMove] = await tx
      .select({ lotId: stockMoves.lotId })
      .from(stockMoves)
      .where(eq(stockMoves.transferId, backorderId))
    expect(restMove.lotId).toBeNull()
  })
})

test("nomor seri: satu rincian per nomor, qty 1", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await readyReceipt(tx, ids.serial, "3")
    await setMoves(tx, lineId, [{ lot: "ZRL-SN1", qty: "1" }])
    const split = await tx.execute<{ id: string }>(
      sql`select split_backorder(${id}, '{}'::jsonb, true) as id`,
    )
    await tx.execute(sql`select validate_transfer(${id}, null)`)
    expect(await balanceOf(tx, ids.serial, "ZRL-SN1")).toBe("1.0000")
    // Sisa 2 unit tanpa nomor seri, walaupun barisnya hanya punya satu rincian.
    const [restMove] = await tx
      .select({ lotId: stockMoves.lotId, qty: stockMoves.qty })
      .from(stockMoves)
      .where(eq(stockMoves.transferId, split.rows[0].id))
    expect(restMove).toEqual({ lotId: null, qty: "2.0000" })
  })
})

test("lot kosong diisi nomor otomatis saat validasi", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await readyReceipt(tx, ids.auto, "5")
    await setMoves(tx, lineId, [
      { lot: null, qty: "2" },
      { lot: "ZRL-X", qty: "3" },
    ])
    await tx.execute(sql`select split_backorder(${id}, '{}'::jsonb, true)`)
    await tx.execute(sql`select validate_transfer(${id}, null)`)
    const moves = await tx
      .select({ lotId: stockMoves.lotId })
      .from(stockMoves)
      .where(eq(stockMoves.lineId, lineId))
    expect(moves).toHaveLength(2)
    expect(moves.every((move) => move.lotId)).toBe(true)
  })
})

test("semua kesalahan rincian dilaporkan sekaligus", async () => {
  await inRollback(db, async (tx) => {
    const lotLine = await readyReceipt(tx, ids.lot, "5")
    const message = await pgErrorInSavepoint(tx, (sp) =>
      setMoves(sp, lotLine.lineId, [
        { lot: "ZRL-A", qty: "4" },
        { lot: "ZRL-A", qty: "1" },
        { lot: null, qty: "1" },
        { lot: "ZRL-C", qty: "0" },
      ]),
    )
    expect(message).toContain("Lot ZRL-A tercatat dua kali.")
    expect(message).toContain("Rincian 3: isi nomor lot produk ZRLL.")
    expect(message).toContain("ZRL-C: qty harus lebih dari 0")
    expect(message).toContain("Qty diterima 6 melebihi qty diminta 5.")

    const serialLine = await readyReceipt(tx, ids.serial, "3")
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        setMoves(sp, serialLine.lineId, [{ lot: "ZRL-SN9", qty: "2" }]),
      ),
    ).toContain("Nomor seri ZRL-SN9: qty harus 1.")
  })
})

test("rincian ditolak setelah penerimaan Selesai", async () => {
  await inRollback(db, async (tx) => {
    const { id, lineId } = await readyReceipt(tx, ids.lot, "1")
    await setMoves(tx, lineId, [{ lot: "ZRL-D", qty: "1" }])
    await tx.execute(sql`select validate_transfer(${id}, null)`)
    expect(
      await pgErrorInSavepoint(tx, (sp) => setMoves(sp, lineId, [{ lot: "ZRL-D", qty: "1" }])),
    ).toBe("Rincian lot hanya bisa diubah selama penerimaan Draft atau Siap.")
  })
})
