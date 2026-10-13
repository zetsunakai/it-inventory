import { eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import type { Role } from "@/lib/permissions"
import { db } from "@/server/db"
import {
  locations,
  lots,
  partners,
  products,
  stockBalances,
  stockMoves,
  systemSettings,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"

import {
  inRollback,
  pgErrorInSavepoint,
  pgErrorMessage,
  purgeInventory,
  setAuditUser,
} from "./helpers"

// validate_transfer() dan penguncian ledger (backlog M2-02). Semua data uji berawalan ZV.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  | "pcs"
  | "product"
  | "lotProduct"
  | "vendor"
  | "customer"
  | "scrap"
  | "adjustment"
  | "bondedRack"
  | "plainRack"
  | "bonded"
  | "plain"
  | "partner",
  string
>
const people = {} as Record<"manajer" | "gudang", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZVCAT", name: "Unit uji validasi" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZVPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const productRows = await db
    .insert(products)
    .values([
      { sku: "ZVP1", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZVLOT", name: "Cat", category: "finished_good", uomId: pcs.id, lotRequired: true },
    ])
    .returning({ id: products.id })
  ;[ids.product, ids.lotProduct] = productRows.map((row) => row.id)

  const [bonded, plain] = await db
    .insert(warehouses)
    .values([
      {
        code: "ZVGB",
        name: "Berikat",
        address: "Bekasi",
        isBonded: true,
        category: "wip" as const,
      },
      { code: "ZVGN", name: "Biasa", address: "Bekasi", isBonded: false, category: "wip" as const },
    ])
    .returning({ id: warehouses.id })
  ids.bonded = bonded.id
  ids.plain = plain.id
  const locationRows = await db
    .insert(locations)
    .values([
      { code: "ZVVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZVCUST", name: "Customer", type: "customer" as const },
      { code: "ZVSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZVADJ", name: "Penyesuaian", type: "adjustment" as const },
      { code: "ZVRB", name: "Rak berikat", type: "internal" as const, warehouseId: bonded.id },
      { code: "ZVRN", name: "Rak biasa", type: "internal" as const, warehouseId: plain.id },
    ])
    .returning({ id: locations.id })
  ;[ids.vendor, ids.customer, ids.scrap, ids.adjustment, ids.bondedRack, ids.plainRack] =
    locationRows.map((row) => row.id)

  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZVPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id

  for (const role of ["manajer", "admin_gudang"] as Role[]) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zv-${role}@validasi.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    people[role === "manajer" ? "manajer" : "gudang"] = user.id
  }
})

afterAll(async () => {
  await purgeInventory(db, [ids.product, ids.lotProduct])
  await db.delete(users).where(like(users.email, "zv-%@validasi.test"))
  await db.delete(partners).where(eq(partners.code, "ZVPART"))
  await db.delete(locations).where(like(locations.code, "ZV%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZV%"))
  await db.delete(products).where(like(products.sku, "ZV%"))
  await db.delete(uoms).where(like(uoms.code, "ZV%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZV%"))
  await db.$client.end()
})

type TransferType = typeof transfers.$inferInsert.type

const ROUTES: Record<string, { type: TransferType; from: keyof typeof ids; to: keyof typeof ids }> =
  {
    receipt: { type: "receipt", from: "vendor", to: "bondedRack" },
    delivery: { type: "delivery", from: "bondedRack", to: "customer" },
    plainReceipt: { type: "receipt", from: "vendor", to: "plainRack" },
    plainDelivery: { type: "delivery", from: "plainRack", to: "customer" },
    scrap: { type: "scrap", from: "bondedRack", to: "scrap" },
  }

async function transfer(
  tx: Tx,
  route: keyof typeof ROUTES,
  lines: { product?: string; qty: string; lot?: string }[],
  values: Partial<typeof transfers.$inferInsert> = {},
) {
  const { type, from, to } = ROUTES[route]
  const [row] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: ids[from],
      destinationLocationId: ids[to],
      partnerId: type === "scrap" ? null : ids.partner,
      ...values,
    })
    .returning()
  for (const line of lines) {
    await tx.insert(stockMoves).values({
      transferId: row.id,
      productId: line.product ?? ids.product,
      lotId: line.lot,
      inputQty: line.qty,
      inputUomId: ids.pcs,
      sourceLocationId: ids[from],
      destinationLocationId: ids[to],
    })
  }
  return row
}

function validate(tx: Tx, transferId: string, doneAt?: Date) {
  return tx.execute(sql`select validate_transfer(${transferId}, ${doneAt?.toISOString() ?? null})`)
}

async function balance(tx: Tx, locationId: string, productId = ids.product) {
  const rows = await tx
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(
      sql`${stockBalances.productId} = ${productId} and ${stockBalances.locationId} = ${locationId}`,
    )
  return rows.reduce((total, row) => total + Number(row.qty), 0)
}

// Saldo tersimpan dibandingkan dengan saldo yang dihitung ulang dari ledger.
async function balancesMatchLedger(tx: Tx) {
  const productIds = [ids.product, ids.lotProduct]
  const saved = await tx
    .select({
      product: stockBalances.productId,
      location: stockBalances.locationId,
      lot: stockBalances.lotId,
      qty: stockBalances.qty,
    })
    .from(stockBalances)
    .where(inArray(stockBalances.productId, productIds))
  const ledger = await tx.execute<{
    product: string
    location: string
    lot: string | null
    qty: string
  }>(sql`
    select product_id as product, location_id as location, lot_id as lot, sum(delta)::numeric(18,4)::text as qty
    from (
      select product_id, destination_location_id as location_id, lot_id, qty as delta
      from stock_moves where status = 'done'
      union all
      select product_id, source_location_id, lot_id, -qty from stock_moves where status = 'done'
    ) ledger
    where product_id in (${sql.join(
      productIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    group by product_id, location_id, lot_id`)
  const key = (row: { product: string; location: string; lot: string | null; qty: string }) =>
    `${row.product}|${row.location}|${row.lot}|${Number(row.qty)}`
  return [saved.map(key).sort(), ledger.rows.map(key).sort()]
}

describe("validasi berhasil", () => {
  test("penerimaan: baris Selesai dengan salinan kategori, saldo bertambah, transfer terkunci", async () => {
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, people.manajer)
      const row = await transfer(tx, "receipt", [{ qty: "10" }, { qty: "5" }])
      await validate(tx, row.id)

      const [saved] = await tx.select().from(transfers).where(eq(transfers.id, row.id))
      expect([saved.status, saved.doneBy, saved.doneAt]).toEqual([
        "done",
        people.manajer,
        expect.any(Date),
      ])
      const moves = await tx.select().from(stockMoves).where(eq(stockMoves.transferId, row.id))
      expect(moves.map((move) => [move.status, move.category])).toEqual([
        ["done", "raw_material"],
        ["done", "raw_material"],
      ])
      expect(await balance(tx, ids.bondedRack)).toBe(15)
      expect(await balance(tx, ids.vendor)).toBe(-15)
    })
  })

  test("saldo selalu sama dengan jumlah pergerakan Selesai", async () => {
    await inRollback(db, async (tx) => {
      const [lot] = await tx
        .insert(lots)
        .values({ productId: ids.lotProduct, name: "B-01" })
        .returning()
      for (const [route, lines] of [
        ["receipt", [{ qty: "20" }, { qty: "4", product: ids.lotProduct, lot: lot.id }]],
        ["delivery", [{ qty: "7.5" }]],
        ["receipt", [{ qty: "3" }]],
        ["delivery", [{ qty: "1", product: ids.lotProduct, lot: lot.id }]],
      ] as const) {
        const row = await transfer(tx, route, [...lines])
        await validate(tx, row.id)
      }
      // Draft tidak dihitung.
      await transfer(tx, "receipt", [{ qty: "100" }])

      const [saved, ledger] = await balancesMatchLedger(tx)
      expect(saved).toEqual(ledger)
      expect(await balance(tx, ids.bondedRack)).toBe(15.5)
    })
  })

  test("gudang non-berikat boleh negatif hanya bila pengaturan mengizinkan", async () => {
    await inRollback(db, async (tx) => {
      const first = await transfer(tx, "plainDelivery", [{ qty: "2" }])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, first.id))).toBe(
        "Stok ZVP1 di ZVRN tidak cukup: tersedia 0, dibutuhkan 2.",
      )
      await tx
        .update(systemSettings)
        .set({ value: true })
        .where(eq(systemSettings.key, "inventory.allow_negative_stock"))
      await validate(tx, first.id)
      expect(await balance(tx, ids.plainRack)).toBe(-2)
    })
  })
})

describe("validasi ditolak", () => {
  test("stok negatif di gudang berikat ditolak dengan pesan per produk, tanpa perubahan", async () => {
    await inRollback(db, async (tx) => {
      const incoming = await transfer(tx, "receipt", [{ qty: "5" }])
      await validate(tx, incoming.id)
      // Allow negative stock tidak berlaku untuk gudang berikat.
      await tx
        .update(systemSettings)
        .set({ value: true })
        .where(eq(systemSettings.key, "inventory.allow_negative_stock"))
      const outgoing = await transfer(tx, "delivery", [{ qty: "3" }, { qty: "4.5" }])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, outgoing.id))).toBe(
        "Stok ZVP1 di ZVRB tidak cukup: tersedia 5, dibutuhkan 7,5.",
      )
      expect(await balance(tx, ids.bondedRack)).toBe(5)
      const [saved] = await tx.select().from(transfers).where(eq(transfers.id, outgoing.id))
      expect(saved.status).toBe("draft")
    })
  })

  test("semua alasan dilaporkan sekaligus", async () => {
    await inRollback(db, async (tx) => {
      const row = await transfer(tx, "scrap", [{ qty: "1", product: ids.lotProduct }])
      const message = await pgErrorMessage(validate(tx, row.id))
      expect(message.split("\n")).toEqual([
        "Alasan wajib diisi.",
        "Belum disetujui Manajer.",
        "Produk ZVLOT wajib diisi nomor lot.",
        "Stok ZVLOT di ZVRB tidak cukup: tersedia 0, dibutuhkan 1.",
      ])
    })
  })

  test("transfer tanpa baris barang dan transfer yang sudah Selesai", async () => {
    await inRollback(db, async (tx) => {
      const empty = await transfer(tx, "receipt", [])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, empty.id))).toBe(
        "Transfer belum punya baris barang.",
      )
      const done = await transfer(tx, "receipt", [{ qty: "1" }])
      await validate(tx, done.id)
      expect(await pgErrorMessage(validate(tx, done.id))).toBe(
        `Transfer ${done.number} sudah Selesai.`,
      )
    })
  })

  test("backdate hanya Manajer; tanggal masa depan ditolak", async () => {
    const yesterday = new Date(Date.now() - 36 * 3600 * 1000)
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, people.gudang)
      await tx.execute(
        sql`insert into user_warehouses (user_id, warehouse_id) values (${people.gudang}, ${ids.bonded})`,
      )
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      expect(await pgErrorInSavepoint(tx, (sp) => validate(sp, row.id, yesterday))).toBe(
        "Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer.",
      )
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          validate(sp, row.id, new Date(Date.now() + 48 * 3600 * 1000)),
        ),
      ).toBe("Tanggal efektif tidak boleh di masa depan.")

      await setAuditUser(tx, people.manajer)
      await validate(tx, row.id, yesterday)
      const [saved] = await tx.select().from(transfers).where(eq(transfers.id, row.id))
      expect(saved.doneAt?.toISOString()).toBe(yesterday.toISOString())
    })
  })

  test("user tanpa akses ke gudang tidak bisa memvalidasi", async () => {
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, people.gudang)
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      expect(await pgErrorMessage(validate(tx, row.id))).toBe(
        "Anda tidak punya akses ke gudang ZVGB.",
      )
    })
  })
})

describe("data Selesai terkunci", () => {
  test("transfer dan baris Selesai tidak bisa diubah atau dihapus", async () => {
    await inRollback(db, async (tx) => {
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      await validate(tx, row.id)
      const [move] = await tx.select().from(stockMoves).where(eq(stockMoves.transferId, row.id))

      for (const [run, message] of [
        [
          (sp: Tx) => sp.update(transfers).set({ notes: "ubah" }).where(eq(transfers.id, row.id)),
          `Transfer ${row.number} sudah Selesai dan tidak bisa diubah. Koreksi lewat retur atau penyesuaian.`,
        ],
        [
          (sp: Tx) => sp.delete(transfers).where(eq(transfers.id, row.id)),
          `Transfer ${row.number} sudah Selesai dan tidak bisa dihapus.`,
        ],
        [
          (sp: Tx) =>
            sp.update(stockMoves).set({ inputQty: "9" }).where(eq(stockMoves.id, move.id)),
          "Baris pergerakan yang sudah Selesai tidak bisa diubah atau dihapus.",
        ],
        [
          (sp: Tx) => sp.delete(stockMoves).where(eq(stockMoves.id, move.id)),
          "Baris pergerakan yang sudah Selesai tidak bisa diubah atau dihapus.",
        ],
        [
          (sp: Tx) =>
            sp.insert(stockMoves).values({
              transferId: row.id,
              productId: ids.product,
              inputQty: "1",
              inputUomId: ids.pcs,
              sourceLocationId: ids.vendor,
              destinationLocationId: ids.bondedRack,
            }),
          "Baris barang transfer yang sudah Selesai tidak bisa diubah.",
        ],
      ] as const) {
        expect(await pgErrorInSavepoint(tx, run)).toBe(message)
      }
    })
  })

  test("status Selesai dan saldo hanya bisa diubah lewat validasi", async () => {
    await inRollback(db, async (tx) => {
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(transfers)
            .set({ status: "done", doneAt: new Date() })
            .where(eq(transfers.id, row.id)),
        ),
      ).toBe("Transfer hanya bisa Selesai lewat validasi.")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(stockBalances)
            .values({ productId: ids.product, locationId: ids.bondedRack, qty: "99" }),
        ),
      ).toBe("Saldo stok hanya bisa berubah lewat validasi transfer.")
    })
  })

  test("transfer yang dibatalkan ikut membatalkan barisnya dan terkunci", async () => {
    await inRollback(db, async (tx) => {
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      await tx
        .update(transfers)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(transfers.id, row.id))
      const moves = await tx.select().from(stockMoves).where(eq(stockMoves.transferId, row.id))
      expect(moves.map((move) => move.status)).toEqual(["cancelled"])
      expect(await pgErrorMessage(validate(tx, row.id))).toBe(`Transfer ${row.number} sudah Batal.`)
    })
  })

  test("draft boleh dihapus beserta barisnya", async () => {
    await inRollback(db, async (tx) => {
      const row = await transfer(tx, "receipt", [{ qty: "1" }])
      await tx.delete(transfers).where(eq(transfers.id, row.id))
      expect(await tx.select().from(stockMoves).where(eq(stockMoves.transferId, row.id))).toEqual(
        [],
      )
    })
  })
})

test("dua validasi bersamaan tidak bisa sama-sama menghabiskan stok yang sama", async () => {
  await db.transaction(async (tx) => {
    const incoming = await transfer(tx, "receipt", [{ qty: "10" }])
    await validate(tx, incoming.id)
  })
  const outgoing = await db.transaction(async (tx) => [
    await transfer(tx, "delivery", [{ qty: "6" }]),
    await transfer(tx, "delivery", [{ qty: "6" }]),
  ])
  const results = await Promise.allSettled(
    outgoing.map((row) => db.execute(sql`select validate_transfer(${row.id})`)),
  )
  expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"])
  const [{ qty }] = await db
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(
      sql`${stockBalances.productId} = ${ids.product} and ${stockBalances.locationId} = ${ids.bondedRack}`,
    )
  expect(Number(qty)).toBe(4)
})
