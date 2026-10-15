import { and, asc, eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  lots,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, pgErrorInSavepoint, pgErrorMessage, purgeInventory, withLine } from "./helpers"

// Pelacakan per lot/nomor seri dan nomor otomatis (backlog R-02). Semua data uji berawalan ZR.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  | "pcs"
  | "lusin"
  | "lot"
  | "lotManual"
  | "serial"
  | "serialManual"
  | "vendor"
  | "customer"
  | "rackA"
  | "rackB"
  | "partner",
  string
>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZRCAT", name: "Unit uji pelacakan" })
    .returning({ id: uomCategories.id })
  const [pcs, lusin] = await db
    .insert(uoms)
    .values([
      { code: "ZRPCS", name: "Buah", categoryId: category.id, factor: "1", isReference: true },
      { code: "ZRLSN", name: "Lusin", categoryId: category.id, factor: "12" },
    ])
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  ids.lusin = lusin.id
  const base = { category: "raw_material" as const, uomId: pcs.id }
  const rows = await db
    .insert(products)
    .values([
      {
        ...base,
        sku: "ZRLOT",
        name: "Cat",
        tracking: "lot" as const,
        lotAuto: true,
        lotDigits: 4,
      },
      { ...base, sku: "ZRLOTM", name: "Lem", tracking: "lot" as const },
      {
        ...base,
        sku: "ZRSN",
        name: "Laptop",
        tracking: "serial" as const,
        lotAuto: true,
        lotDigits: 3,
      },
      { ...base, sku: "ZRSNM", name: "Mesin", tracking: "serial" as const },
    ])
    .returning({ id: products.id })
  ;[ids.lot, ids.lotManual, ids.serial, ids.serialManual] = rows.map((row) => row.id)

  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZRG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const locationRows = await db
    .insert(locations)
    .values([
      { code: "ZRVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZRCUST", name: "Customer", type: "customer" as const },
      { code: "ZRRA", name: "Rak A", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZRRB", name: "Rak B", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ;[ids.vendor, ids.customer, ids.rackA, ids.rackB] = locationRows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZRPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZR",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.lot, ids.lotManual, ids.serial, ids.serialManual])
  await db.delete(partners).where(eq(partners.code, "ZRPART"))
  await db.delete(locations).where(like(locations.code, "ZR%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZR%"))
  await db.delete(products).where(like(products.sku, "ZR%"))
  await db.delete(uoms).where(like(uoms.code, "ZR%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZR%"))
  await db.$client.end()
})

type Line = { product: string; qty: string; lot?: string; uom?: string }

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

async function draft(
  tx: Tx,
  type: "receipt" | "delivery" | "internal",
  from: string,
  to: string,
  lines: Line[],
) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      partnerId: type === "internal" ? null : ids.partner,
    })
    .returning({ id: transfers.id })
  let position = 1
  for (const line of lines) {
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: transfer.id,
        position: position++,
        productId: line.product,
        lotId: line.lot ? await lotId(tx, line.product, line.lot) : null,
        inputQty: line.qty,
        inputUomId: line.uom ?? ids.pcs,
        sourceLocationId: from,
        destinationLocationId: to,
      }),
    )
  }
  return transfer.id
}

const validate = (tx: Tx, id: string) => tx.execute(sql`select validate_transfer(${id})`)

const receive = async (tx: Tx, lines: Line[]) => {
  const id = await draft(tx, "receipt", ids.vendor, ids.rackA, lines)
  await validate(tx, id)
  return id
}

async function movedLots(tx: Tx, transferId: string) {
  const rows = await tx
    .select({ lot: lots.name, qty: stockMoves.qty })
    .from(stockMoves)
    .innerJoin(lots, eq(lots.id, stockMoves.lotId))
    .where(eq(stockMoves.transferId, transferId))
    .orderBy(asc(lots.name))
  return rows.map((row) => [row.lot, row.qty])
}

describe("nomor otomatis saat validasi", () => {
  test("per lot: satu lot baru per baris barang masuk", async () => {
    await inRollback(db, async (tx) => {
      const first = await receive(tx, [
        { product: ids.lot, qty: "5" },
        { product: ids.lot, qty: "2" },
      ])
      expect(await movedLots(tx, first)).toEqual([
        ["ZRLOT-0001", "5.0000"],
        ["ZRLOT-0002", "2.0000"],
      ])
      // Lot yang diisi manual tetap dipakai.
      const second = await receive(tx, [{ product: ids.lot, qty: "1", lot: "MANUAL-1" }])
      expect(await movedLots(tx, second)).toEqual([["MANUAL-1", "1.0000"]])
    })
  })

  test("per nomor seri: qty n dipecah jadi n baris ber-qty 1 dengan nomor seri baru", async () => {
    await inRollback(db, async (tx) => {
      // 1 lusin = 12 buah.
      const id = await receive(tx, [
        { product: ids.serial, qty: "3" },
        { product: ids.serial, qty: "1", uom: ids.lusin },
      ])
      const serials = await movedLots(tx, id)
      expect(serials).toHaveLength(15)
      expect(serials[0]).toEqual(["ZRSN-001", "1.0000"])
      expect(serials.at(-1)).toEqual(["ZRSN-015", "1.0000"])
    })
  })

  test("validasi gagal tidak memakai nomor urut", async () => {
    await inRollback(db, async (tx) => {
      const id = await draft(tx, "receipt", ids.vendor, ids.rackA, [
        { product: ids.lot, qty: "1" },
        { product: ids.lotManual, qty: "1" },
      ])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, id))).toBe(
        "Produk ZRLOTM wajib diisi nomor lot.",
      )
      await tx.delete(stockMoves).where(eq(stockMoves.productId, ids.lotManual))
      await validate(tx, id)
      expect(await movedLots(tx, id)).toEqual([["ZRLOT-0001", "1.0000"]])
    })
  })
})

describe("aturan pelacakan", () => {
  test("lot/seri wajib bila tidak bisa diisi otomatis; nomor seri qty 1 dan bilangan bulat", async () => {
    await inRollback(db, async (tx) => {
      const id = await draft(tx, "receipt", ids.vendor, ids.rackA, [
        { product: ids.lotManual, qty: "1" },
        { product: ids.serialManual, qty: "1" },
        { product: ids.serialManual, qty: "2", lot: "SN-1" },
        { product: ids.serial, qty: "1.5" },
      ])
      expect((await pgErrorInSavepoint(tx, (sp) => validate(sp, id))).split("\n")).toEqual([
        "Produk ZRLOTM wajib diisi nomor lot.",
        "Qty produk ZRSN harus bilangan bulat karena dilacak per nomor seri.",
        "Nomor seri SN-1 produk ZRSNM: qty harus 1.",
        "Produk ZRSNM wajib diisi nomor seri.",
      ])
    })
  })

  test("nomor seri hanya satu di seluruh gudang; boleh masuk lagi setelah keluar", async () => {
    await inRollback(db, async (tx) => {
      await receive(tx, [{ product: ids.serialManual, qty: "1", lot: "SN-9" }])
      const again = await draft(tx, "receipt", ids.vendor, ids.rackB, [
        { product: ids.serialManual, qty: "1", lot: "SN-9" },
      ])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, again))).toBe(
        "Nomor seri SN-9 produk ZRSNM sudah ada di stok.",
      )
      // Pindah lokasi di dalam gudang tidak menambah jumlahnya.
      await validate(
        tx,
        await draft(tx, "internal", ids.rackA, ids.rackB, [
          { product: ids.serialManual, qty: "1", lot: "SN-9" },
        ]),
      )
      await validate(
        tx,
        await draft(tx, "delivery", ids.rackB, ids.customer, [
          { product: ids.serialManual, qty: "1", lot: "SN-9" },
        ]),
      )
      await validate(tx, again)
    })
  })

  test("dua nomor seri sama di satu transfer ditolak", async () => {
    await inRollback(db, async (tx) => {
      const id = await draft(tx, "receipt", ids.vendor, ids.rackA, [
        { product: ids.serialManual, qty: "1", lot: "SN-2" },
        { product: ids.serialManual, qty: "1", lot: "SN-2" },
      ])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, id))).toBe(
        "Nomor seri SN-2 produk ZRSNM sudah ada di stok.",
      )
    })
  })

  test("pelacakan tidak bisa diubah selama ada stok atau transaksi belum selesai", async () => {
    await inRollback(db, async (tx) => {
      const change = () =>
        tx.update(products).set({ tracking: "none" }).where(eq(products.id, ids.lotManual))
      const open = await draft(tx, "receipt", ids.vendor, ids.rackA, [
        { product: ids.lotManual, qty: "2", lot: "L1" },
      ])
      const message =
        "Pelacakan produk ZRLOTM tidak bisa diubah karena produk masih punya stok atau transaksi yang belum selesai."
      expect(await pgErrorInSavepoint(tx, change)).toBe(message)
      await validate(tx, open)
      expect(await pgErrorInSavepoint(tx, change)).toBe(message)
      await validate(
        tx,
        await draft(tx, "delivery", ids.rackA, ids.customer, [
          { product: ids.lotManual, qty: "2", lot: "L1" },
        ]),
      )
      await change()
    })
  })

  test("nomor otomatis hanya untuk produk yang dilacak", async () => {
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorMessage(
          tx.insert(products).values({
            sku: "ZRX",
            name: "X",
            category: "wip",
            uomId: ids.pcs,
            lotAuto: true,
          }),
        ),
      ).toContain("products_lot_auto_needs_tracking")
    })
  })
})
