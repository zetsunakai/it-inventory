import { eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { listStock, stockCard } from "@/server/queries/stock"

import { purgeInventory, withLine } from "./helpers"

// Tampilan stok dan kartu stok (backlog M2-11). Data uji berawalan ZS, bertanggal Maret 2021.

const ids = {} as Record<
  | "pcs"
  | "product"
  | "one"
  | "two"
  | "rackA"
  | "rackB"
  | "rackOther"
  | "vendor"
  | "customer"
  | "partner",
  string
>
const people = {} as Record<"admin" | "gudang", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZSCAT", name: "Unit uji stok" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZSPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZSP1", name: "Baut stok", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZSG1", "ZSG2"].map((code) => ({
        code,
        name: code,
        address: "Bekasi",
        isBonded: false,
        category: "raw_material" as const,
      })),
    )
    .returning({ id: warehouses.id })
  ids.one = one.id
  ids.two = two.id
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZSRA", name: "Rak A", type: "internal" as const, warehouseId: one.id },
      { code: "ZSRB", name: "Rak B", type: "internal" as const, warehouseId: one.id },
      { code: "ZSRC", name: "Rak gudang 2", type: "internal" as const, warehouseId: two.id },
      { code: "ZSVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZSCUST", name: "Customer", type: "customer" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.rackA, ids.rackB, ids.rackOther, ids.vendor, ids.customer] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZSV",
      name: "Mitra stok",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZSV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  for (const [key, role] of [
    ["admin", "administrator"],
    ["gudang", "admin_gudang"],
  ] as const) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zs-${role}@stok.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    people[key] = user.id
  }

  // Maret 2021: terima 10 di rak A, pindah 3 ke rak B, kirim 2, terima 5 di gudang 2.
  await move("receipt", ids.vendor, ids.rackA, "10", "2021-03-01T09:00:00+07:00")
  await move("internal", ids.rackA, ids.rackB, "3", "2021-03-05T09:00:00+07:00")
  await move("delivery", ids.rackA, ids.customer, "2", "2021-03-10T09:00:00+07:00")
  await move("receipt", ids.vendor, ids.rackOther, "5", "2021-03-12T09:00:00+07:00")
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.delete(users).where(like(users.email, "zs-%@stok.test"))
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZS%"))
  await db.delete(warehouses).where(inArray(warehouses.id, [ids.one, ids.two]))
  await db.delete(products).where(eq(products.id, ids.product))
  await db.delete(uoms).where(like(uoms.code, "ZS%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZS%"))
  await db.$client.end()
})

async function move(
  type: "receipt" | "delivery" | "internal",
  from: string,
  to: string,
  qty: string,
  at: string,
) {
  await db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(transfers)
      .values({
        type,
        sourceLocationId: from,
        destinationLocationId: to,
        partnerId: type === "internal" ? null : ids.partner,
      })
      .returning({ id: transfers.id })
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: transfer.id,
        productId: ids.product,
        inputQty: qty,
        inputUomId: ids.pcs,
        sourceLocationId: from,
        destinationLocationId: to,
      }),
    )
    await tx.execute(sql`select validate_transfer(${transfer.id}, ${at}::timestamptz)`)
  })
}

const page = { search: "ZSP1", page: 1, pageSize: 50, offset: 0 }

function summary(rows: Awaited<ReturnType<typeof listStock>>["rows"]) {
  return rows.map((row) => [row.locationPath, row.qty])
}

describe("saldo", () => {
  test("saldo sekarang per lokasi; filter gudang", async () => {
    const now = await listStock({ ...page, userId: people.admin })
    expect(summary(now.rows)).toEqual([
      ["ZSRA", "5.0000"],
      ["ZSRB", "3.0000"],
      ["ZSRC", "5.0000"],
    ])
    const one = await listStock({ ...page, userId: people.admin, warehouseId: ids.one })
    expect(one.total).toBe(2)
  })

  test("saldo per tanggal dihitung dari ledger", async () => {
    const early = await listStock({ ...page, userId: people.admin, date: "2021-03-06" })
    expect(summary(early.rows)).toEqual([
      ["ZSRA", "7.0000"],
      ["ZSRB", "3.0000"],
    ])
  })

  test("saldo di layar sama dengan hasil fungsi saldo untuk tanggal yang sama", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
    const fromBalances = await listStock({ ...page, userId: people.admin })
    const fromLedger = await listStock({ ...page, userId: people.admin, date: today })
    // Saldo per tanggal tidak punya qty dipesan; selain itu sama.
    expect(fromLedger.rows).toEqual(fromBalances.rows.map((row) => ({ ...row, reservedQty: null })))
    expect(fromBalances.rows.every((row) => row.reservedQty === "0.0000")).toBe(true)
  })

  test("hanya gudang yang boleh diakses user", async () => {
    expect((await listStock({ ...page, userId: people.gudang })).total).toBe(0)
  })
})

test("kartu stok: saldo awal, masuk, keluar, dan saldo berjalan per gudang", async () => {
  const card = await stockCard({
    productId: ids.product,
    warehouseId: ids.one,
    from: "2021-03-02",
    to: "2021-03-31",
  })
  expect(card.opening).toBe("10.0000")
  expect(
    card.lines.map((line) => [
      line.transferNumber.slice(0, 3),
      line.inQty,
      line.outQty,
      line.balance,
    ]),
  ).toEqual([
    ["TRF", "3.0000", "3.0000", "10.0000"],
    ["PGR", "0.0000", "2.0000", "8.0000"],
  ])
  expect([card.inQty, card.outQty, card.closing]).toEqual([3, 5, "8.0000"])
})
