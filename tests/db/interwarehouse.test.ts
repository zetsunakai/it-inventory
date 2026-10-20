import { and, eq, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, expect, test } from "vitest"

import {
  getInterwarehouse,
  listInterwarehouse,
} from "@/modules/inventory/server/queries/interwarehouse"
import { db } from "@/server/db"
import {
  interwarehouseTransferLines,
  interwarehouseTransfers,
  locations,
  partners,
  products,
  stockBalances,
  stockMoves,
  transferLines,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, pgErrorInSavepoint, purgeInventory, withLine } from "./helpers"

// Transfer antar gudang lewat lokasi transit (backlog R-10). Semua data uji berawalan ZIW.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  "pcs" | "product" | "vendor" | "rackA" | "rackA2" | "rackB" | "transit" | "partner",
  string
>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZIWCAT", name: "Unit uji antar gudang" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZIWPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZIWP", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZIWG1", "ZIWG2"].map((code) => ({
        code,
        name: code,
        address: "Bekasi",
      })),
    )
    .returning({ id: warehouses.id })
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZIWVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZIWSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZIWRA", name: "Rak A", type: "internal" as const, warehouseId: one.id },
      { code: "ZIWRA2", name: "Rak A2", type: "internal" as const, warehouseId: one.id },
      { code: "ZIWRB", name: "Rak B", type: "internal" as const, warehouseId: two.id },
    ])
    .returning({ id: locations.id })
  ;[ids.vendor, , ids.rackA, ids.rackA2, ids.rackB] = rows.map((row) => row.id)
  const [transit] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.code, "TRANSIT"))
  ids.transit = transit.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZIWPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZIW",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterEach(async () => {
  await purgeInventory(db, [ids.product])
  await db.delete(interwarehouseTransfers).where(like(interwarehouseTransfers.reference, "ZIW%"))
})

afterAll(async () => {
  await db.delete(partners).where(eq(partners.code, "ZIWPART"))
  await db.delete(locations).where(like(locations.code, "ZIW%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZIW%"))
  await db.delete(products).where(like(products.sku, "ZIW%"))
  await db.delete(uoms).where(like(uoms.code, "ZIW%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZIW%"))
  await db.$client.end()
})

async function receive(tx: Tx, qty: string) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rackA,
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
      destinationLocationId: ids.rackA,
    }),
  )
  await tx.execute(sql`select validate_transfer(${transfer.id})`)
}

async function request(tx: Tx, qty: string, destination = ids.rackB) {
  const [row] = await tx
    .insert(interwarehouseTransfers)
    .values({
      sourceLocationId: ids.rackA,
      destinationLocationId: destination,
      transitLocationId: ids.transit,
      reference: "ZIW-UJI",
    })
    .returning({ id: interwarehouseTransfers.id, number: interwarehouseTransfers.number })
  await tx.insert(interwarehouseTransferLines).values({
    interwarehouseId: row.id,
    productId: ids.product,
    inputQty: qty,
    inputUomId: ids.pcs,
  })
  return row
}

const linked = (tx: Tx, id: string) =>
  tx
    .select({
      id: transfers.id,
      code: transfers.movementCode,
      status: transfers.status,
      type: transfers.type,
    })
    .from(transfers)
    .where(eq(transfers.interwarehouseId, id))
    .orderBy(transfers.createdAt, transfers.number)

async function stock(tx: Tx, location: string) {
  const rows = await tx
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, ids.product), eq(stockBalances.locationId, location)))
  return rows.reduce((sum, row) => sum + Number(row.qty), 0)
}

const statusOf = async (tx: Tx, id: string) =>
  (
    await tx
      .select({ status: interwarehouseTransfers.status })
      .from(interwarehouseTransfers)
      .where(eq(interwarehouseTransfers.id, id))
  )[0].status

test("keluar ke transit, lalu masuk ke gudang tujuan sebesar qty yang keluar", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, "10")
    const req = await request(tx, "6")
    expect(req.number).toMatch(/^ITW\/\d{4}\/\d{5}$/)
    await tx.execute(sql`select confirm_interwarehouse(${req.id})`)
    const [out] = await linked(tx, req.id)
    expect([out.code, out.status]).toEqual(["itw_out", "ready"])
    expect(await statusOf(tx, req.id)).toBe("confirmed")

    await tx.execute(sql`select validate_transfer(${out.id})`)
    // Barang di jalan tercatat di transit, bukan di gudang mana pun.
    expect([
      await stock(tx, ids.rackA),
      await stock(tx, ids.transit),
      await stock(tx, ids.rackB),
    ]).toEqual([4, 6, 0])
    expect(await statusOf(tx, req.id)).toBe("in_progress")
    const incoming = (await linked(tx, req.id))[1]
    expect([incoming.code, incoming.status]).toEqual(["itw_in", "ready"])

    await tx.execute(sql`select validate_transfer(${incoming.id})`)
    expect([await stock(tx, ids.transit), await stock(tx, ids.rackB)]).toEqual([0, 6])
    expect(await statusOf(tx, req.id)).toBe("done")
  })
})

test("sisa di transit dikembalikan ke gudang asal (itw_rtn)", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, "10")
    const req = await request(tx, "8")
    await tx.execute(sql`select confirm_interwarehouse(${req.id})`)
    await tx.execute(sql`select validate_transfer(${(await linked(tx, req.id))[0].id})`)
    const incoming = (await linked(tx, req.id))[1]
    // Hanya 5 yang diterima; sisanya dibuang dari transfer masuk dan tetap di transit.
    const [line] = (
      await tx.execute<{ id: string }>(
        sql`select id from transfer_lines where transfer_id = ${incoming.id}`,
      )
    ).rows
    await tx.execute(
      sql`select split_backorder(${incoming.id}, ${JSON.stringify({ [line.id]: "5" })}::jsonb, false)`,
    )
    await tx.execute(sql`select validate_transfer(${incoming.id})`)
    expect(await stock(tx, ids.transit)).toBe(3)
    expect(await statusOf(tx, req.id)).toBe("in_progress")

    const [{ id: back }] = (
      await tx.execute<{ id: string }>(sql`select settle_interwarehouse(${req.id}, 'return') as id`)
    ).rows
    const [ret] = (await linked(tx, req.id)).filter((row) => row.id === back)
    expect([ret.code, ret.status]).toEqual(["itw_rtn", "ready"])
    await tx.execute(sql`select validate_transfer(${back})`)
    expect([
      await stock(tx, ids.rackA),
      await stock(tx, ids.transit),
      await stock(tx, ids.rackB),
    ]).toEqual([5, 0, 5])
    expect(await statusOf(tx, req.id)).toBe("done")
  })
})

test("susut transit dicatat sebagai scrap yang perlu persetujuan", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, "4")
    const req = await request(tx, "4")
    await tx.execute(sql`select confirm_interwarehouse(${req.id})`)
    await tx.execute(sql`select validate_transfer(${(await linked(tx, req.id))[0].id})`)
    await tx.execute(sql`select cancel_transfer(${(await linked(tx, req.id))[1].id})`)

    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select settle_interwarehouse(${req.id}, 'loss', '')`),
      ),
    ).toBe("Alasan susut transit wajib diisi.")
    const [{ id: loss }] = (
      await tx.execute<{ id: string }>(
        sql`select settle_interwarehouse(${req.id}, 'loss', 'Pecah di jalan') as id`,
      )
    ).rows
    const [row] = (await linked(tx, req.id)).filter((item) => item.id === loss)
    expect([row.type, row.code, row.status]).toEqual(["scrap", "pu", "ready"])
    // Jenis pemakaian diisi database dari lokasi asal transit (R-12) dan tidak bisa diganti.
    const [{ usage_type }] = (
      await tx.execute<{ usage_type: string }>(
        sql`select usage_type from transfers where id = ${loss}`,
      )
    ).rows
    expect(usage_type).toBe("transit_loss")
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`update transfers set usage_type = 'scrap' where id = ${loss}`),
      ),
    ).toBe("Barang di lokasi transit hanya bisa dicatat sebagai susut transit.")
    expect(
      await pgErrorInSavepoint(tx, (sp) => sp.execute(sql`select validate_transfer(${loss})`)),
    ).toBe("Belum disetujui Manajer.")
  })
})

test("transfer masuk tidak boleh melebihi yang di perjalanan; batal hanya sebelum barang keluar", async () => {
  await inRollback(db, async (tx) => {
    await receive(tx, "5")
    const req = await request(tx, "5")
    await tx.execute(sql`select confirm_interwarehouse(${req.id})`)
    const [out] = await linked(tx, req.id)
    await tx.execute(sql`select validate_transfer(${out.id})`)
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select cancel_interwarehouse(${req.id})`),
      ),
    ).toBe(
      "Permintaan yang barangnya sudah keluar tidak bisa dibatalkan. Selesaikan sisanya di transit.",
    )
    const incoming = (await linked(tx, req.id))[1]
    await tx.execute(sql`select reset_transfer_to_draft(${incoming.id})`)
    await tx.execute(
      sql`update transfer_lines set input_qty = 7 where transfer_id = ${incoming.id}`,
    )
    await tx.execute(sql`update stock_moves set input_qty = 7 where transfer_id = ${incoming.id}`)
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select validate_transfer(${incoming.id})`),
      ),
    ).toBe("Qty ZIWP melebihi yang masih di perjalanan (5).")

    const draft = await request(tx, "1")
    await tx.execute(sql`select cancel_interwarehouse(${draft.id})`)
    expect(await statusOf(tx, draft.id)).toBe("cancelled")
  })
})

test("gudang asal dan tujuan harus berbeda", async () => {
  await inRollback(db, async (tx) => {
    expect(await pgErrorInSavepoint(tx, (sp) => request(sp, "1", ids.rackA2))).toBe(
      "Gudang asal dan tujuan harus berbeda. Untuk satu gudang, pakai Pindah lokasi.",
    )
  })
})

// Qty per produk dan barang di perjalanan untuk daftar dan detail (I-05). Data disimpan (bukan
// rollback) karena query halaman memakai koneksi sendiri; afterEach membersihkannya.
test("detail menghitung qty dikirim, diterima, di perjalanan, dan belum dikirim; daftar menampilkan barang di perjalanan", async () => {
  const [admin] = await db
    .insert(users)
    .values({ name: "Uji admin", email: "ziw-admin@antar-gudang.test", emailVerified: true })
    .returning({ id: users.id })
  await db.insert(userRoles).values({ userId: admin.id, role: "administrator" })
  try {
    const req = await db.transaction(async (tx) => {
      await receive(tx, "10")
      const row = await request(tx, "8")
      await tx.execute(sql`select confirm_interwarehouse(${row.id})`)
      const [out] = await linked(tx, row.id)
      const [line] = await tx
        .select({ id: transferLines.id })
        .from(transferLines)
        .where(eq(transferLines.transferId, out.id))
      // Kirim 5 dari 8; sisanya jadi transfer keluar lanjutan.
      await tx.execute(
        sql`select split_backorder(${out.id}, ${JSON.stringify({ [line.id]: "5" })}::jsonb, true)`,
      )
      await tx.execute(sql`select validate_transfer(${out.id})`)
      return row
    })
    const detail = await getInterwarehouse(admin.id, req.id)
    expect(detail?.progress).toEqual([
      {
        sku: "ZIWP",
        name: "Baut",
        uom: "ZIWPCS",
        requested: "8.0000",
        sent: "5.0000",
        received: "0.0000",
        returned: "0.0000",
        lost: "0.0000",
        pending: "3.0000",
      },
    ])
    const list = await listInterwarehouse({
      userId: admin.id,
      inTransit: true,
      search: "ZIW-UJI",
      page: 1,
      pageSize: 10,
      offset: 0,
    })
    expect(list.rows.map((row) => [row.number, row.transitQty, row.transitUom])).toEqual([
      [req.number, "5.0000", "ZIWPCS"],
    ])
  } finally {
    await db.delete(users).where(eq(users.id, admin.id))
  }
})
