import { and, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import {
  addCountLine,
  approveStockCount,
  cancelStockCount,
  createStockCount,
  recordCount,
  reopenStockCount,
  submitStockCount,
} from "@/app/(app)/inventory/opname/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockBalances,
  stockCountLines,
  stockCounts,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  users,
  userWarehouses,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { purgeInventory, withLine } from "./helpers"

// Stock opname (backlog M2-09). Semua data uji berawalan ZO.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

const ids = {} as Record<
  "pcs" | "product" | "other" | "warehouse" | "rack" | "bin" | "elsewhere" | "vendor" | "partner",
  string
>
const people = {} as Record<"manajer" | "gudang", CurrentUser>

function loginAs(person: keyof typeof people) {
  session.user = people[person]
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZOCAT", name: "Unit uji opname" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZOPCS",
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
      { sku: "ZOP1", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZOP2", name: "Mur", category: "raw_material", uomId: pcs.id },
    ])
    .returning({ id: products.id })
  ;[ids.product, ids.other] = productRows.map((row) => row.id)
  const [warehouse] = await db
    .insert(warehouses)
    .values({
      code: "ZOG",
      name: "Gudang opname",
      address: "Bekasi",
      isBonded: true,
      category: "wip",
    })
    .returning({ id: warehouses.id })
  ids.warehouse = warehouse.id
  const [rack] = await db
    .insert(locations)
    .values({ code: "ZORAK", name: "Rak", type: "internal", warehouseId: warehouse.id })
    .returning({ id: locations.id })
  ids.rack = rack.id
  const rows = await db
    .insert(locations)
    .values([
      {
        code: "ZOBIN",
        name: "Bin",
        type: "internal" as const,
        warehouseId: warehouse.id,
        parentId: rack.id,
      },
      { code: "ZOLAIN", name: "Rak lain", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZOVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZOADJ", name: "Penyesuaian", type: "adjustment" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.bin, ids.elsewhere, ids.vendor] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZOV",
      name: "Pemasok opname",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: false,
      identityType: "other",
      identityNumber: "ZOV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id

  for (const [key, role] of [
    ["manajer", "manajer"],
    ["gudang", "admin_gudang"],
  ] as [keyof typeof people, Role][]) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zo-${role}@opname.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    people[key] = {
      id: user.id,
      name: `Uji ${role}`,
      email: `zo-${role}@opname.test`,
      roles: [role],
      twoFactorEnabled: true,
    }
  }
  await db.insert(userWarehouses).values({ userId: people.gudang.id, warehouseId: ids.warehouse })
})

async function purgeCounts() {
  await purgeInventory(db, [ids.product, ids.other])
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx
      .delete(stockCountLines)
      .where(inArray(stockCountLines.productId, [ids.product, ids.other]))
    await tx.delete(stockCounts).where(eq(stockCounts.warehouseId, ids.warehouse))
  })
}

afterEach(purgeCounts)

afterAll(async () => {
  await db.delete(userWarehouses).where(eq(userWarehouses.warehouseId, ids.warehouse))
  await db.delete(users).where(like(users.email, "zo-%@opname.test"))
  await db.delete(partners).where(eq(partners.code, "ZOV"))
  await db.update(locations).set({ parentId: null }).where(like(locations.code, "ZO%"))
  await db.delete(locations).where(like(locations.code, "ZO%"))
  await db.delete(warehouses).where(eq(warehouses.id, ids.warehouse))
  await db.delete(products).where(like(products.sku, "ZO%"))
  await db.delete(uoms).where(like(uoms.code, "ZO%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZO%"))
  await db.$client.end()
})

// Stok awal langsung lewat validate_transfer (tanpa user, jadi tanpa cek akses).
async function receive(productId: string, locationId: string, qty: string) {
  await db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(transfers)
      .values({
        type: "receipt",
        sourceLocationId: ids.vendor,
        destinationLocationId: locationId,
        partnerId: ids.partner,
      })
      .returning({ id: transfers.id })
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: transfer.id,
        productId,
        inputQty: qty,
        inputUomId: ids.pcs,
        sourceLocationId: ids.vendor,
        destinationLocationId: locationId,
      }),
    )
    await tx.execute(sql`select validate_transfer(${transfer.id})`)
  })
}

async function newCount(values: Record<string, string> = {}) {
  loginAs("manajer")
  const result = await createStockCount(null, form({ warehouseId: ids.warehouse, ...values }))
  if (!result.ok) throw new Error(result.errors.join(" | "))
  return result.data.id
}

async function lines(countId: string) {
  return db
    .select({
      id: stockCountLines.id,
      productId: stockCountLines.productId,
      locationId: stockCountLines.locationId,
      systemQty: stockCountLines.systemQty,
      countedQty: stockCountLines.countedQty,
    })
    .from(stockCountLines)
    .where(eq(stockCountLines.stockCountId, countId))
}

async function stockAt(productId: string, locationId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(and(eq(stockBalances.productId, productId), eq(stockBalances.locationId, locationId)))
  return row ? Number(row.qty) : 0
}

describe("membuat sesi", () => {
  test("daftar hitung berisi barang bersaldo di lingkup sesi; nomor OPN dibuat database", async () => {
    await receive(ids.product, ids.rack, "10")
    await receive(ids.other, ids.bin, "4")
    await receive(ids.product, ids.elsewhere, "7")

    const rackOnly = await newCount({ locationId: ids.rack })
    expect((await lines(rackOnly)).map((line) => [line.locationId, line.productId]).sort()).toEqual(
      [
        [ids.rack, ids.product],
        [ids.bin, ids.other],
      ].sort(),
    )
    const whole = await newCount()
    expect(await lines(whole)).toHaveLength(3)
    const [saved] = await db.select().from(stockCounts).where(eq(stockCounts.id, whole))
    expect([saved.number.slice(0, 4), saved.status, saved.createdBy]).toEqual([
      "OPN/",
      "counting",
      people.manajer.id,
    ])
    // Daftar hitung tanpa qty sistem selama penghitungan.
    expect((await lines(whole)).every((line) => line.systemQty === null)).toBe(true)
  })

  test("hanya Manajer (inventory:approve) yang membuat sesi", async () => {
    loginAs("gudang")
    expect(await createStockCount(null, form({ warehouseId: ids.warehouse }))).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
  })
})

describe("menghitung, mengajukan, dan menyetujui", () => {
  test("selisih yang disetujui tercatat sebagai penyesuaian yang menunjuk ke sesi opname", async () => {
    await receive(ids.product, ids.rack, "10")
    await receive(ids.other, ids.bin, "4")
    const countId = await newCount({ locationId: ids.rack })
    const [productLine, otherLine] = (await lines(countId)).sort((a) =>
      a.productId === ids.product ? -1 : 1,
    )

    loginAs("gudang")
    expect(await recordCount({ lineId: productLine.id, qty: "8" })).toMatchObject({ ok: true })
    // Belum semua dihitung.
    const early = await submitStockCount({ id: countId })
    expect(early).toMatchObject({ ok: false })
    expect(!early.ok && early.errors[0]).toMatch(/^1 baris belum dihitung: ZOP2 di ZORAK\/ZOBIN/)

    expect(await recordCount({ lineId: otherLine.id, qty: "5,5" })).toMatchObject({ ok: true })
    expect(await submitStockCount({ id: countId })).toMatchObject({ ok: true })
    // Terkunci selama menunggu persetujuan.
    expect(await recordCount({ lineId: otherLine.id, qty: "1" })).toMatchObject({
      ok: false,
      errors: ["Daftar hitung hanya bisa diubah selama sesi opname masih Dihitung."],
    })
    expect((await lines(countId)).map((line) => [line.systemQty, line.countedQty]).sort()).toEqual(
      [
        ["10.0000", "8.0000"],
        ["4.0000", "5.5000"],
      ].sort(),
    )

    expect(await approveStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    loginAs("manajer")
    expect(await approveStockCount({ id: countId })).toMatchObject({ ok: true })

    expect(await stockAt(ids.product, ids.rack)).toBe(8)
    expect(await stockAt(ids.other, ids.bin)).toBe(5.5)
    const adjustments = await db
      .select({
        number: transfers.number,
        status: transfers.status,
        reason: transfers.reason,
        approvedBy: transfers.approvedBy,
        sourceLocationId: transfers.sourceLocationId,
      })
      .from(transfers)
      .where(eq(transfers.stockCountId, countId))
    expect(adjustments).toHaveLength(2)
    expect(adjustments.every((row) => row.status === "done" && row.number.startsWith("ADJ/"))).toBe(
      true,
    )
    expect(adjustments[0].reason).toMatch(/^Selisih stock opname OPN\//)
    expect(adjustments.every((row) => row.approvedBy === people.manajer.id)).toBe(true)
    const [saved] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    expect([saved.status, saved.approvedBy]).toEqual(["approved", people.manajer.id])
  })

  test("qty sistem dihitung per cut-off: pergerakan setelah sesi dibuat tidak ikut", async () => {
    await receive(ids.product, ids.rack, "10")
    const countId = await newCount({ locationId: ids.rack })
    await receive(ids.product, ids.rack, "3")
    const [line] = await lines(countId)
    loginAs("gudang")
    await recordCount({ lineId: line.id, qty: "10" })
    await submitStockCount({ id: countId })
    expect((await lines(countId))[0].systemQty).toBe("10.0000")
    loginAs("manajer")
    expect(await approveStockCount({ id: countId })).toMatchObject({ ok: true })
    // Tanpa selisih: tidak ada penyesuaian, stok tetap 13.
    expect(await db.select().from(transfers).where(eq(transfers.stockCountId, countId))).toEqual([])
    expect(await stockAt(ids.product, ids.rack)).toBe(13)
  })

  test("barang temuan di luar daftar ditambahkan dan menambah stok setelah disetujui", async () => {
    const countId = await newCount({ locationId: ids.rack })
    loginAs("gudang")
    expect(
      await addCountLine({ countId, productId: ids.other, locationId: ids.elsewhere, lotName: "" }),
    ).toMatchObject({ ok: false, errors: ["Lokasi di luar lingkup sesi opname."] })
    const added = await addCountLine({
      countId,
      productId: ids.other,
      locationId: ids.bin,
      lotName: "",
    })
    if (!added.ok) throw new Error(added.errors.join(" | "))
    expect(
      await addCountLine({ countId, productId: ids.other, locationId: ids.bin, lotName: "" }),
    ).toMatchObject({ ok: false, errors: ["Barang ini sudah ada di daftar hitung."] })
    await recordCount({ lineId: added.data.id, qty: "2" })
    await submitStockCount({ id: countId })
    loginAs("manajer")
    await approveStockCount({ id: countId })
    expect(await stockAt(ids.other, ids.bin)).toBe(2)
  })

  test("dikembalikan ke penghitungan bisa diubah lagi; sesi batal terkunci", async () => {
    await receive(ids.product, ids.rack, "1")
    const countId = await newCount({ locationId: ids.rack })
    const [line] = await lines(countId)
    loginAs("gudang")
    await recordCount({ lineId: line.id, qty: "1" })
    await submitStockCount({ id: countId })
    loginAs("manajer")
    expect(await reopenStockCount({ id: countId })).toMatchObject({ ok: true })
    loginAs("gudang")
    expect(await recordCount({ lineId: line.id, qty: "0" })).toMatchObject({ ok: true })
    loginAs("manajer")
    expect(await cancelStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await cancelStockCount({ id: countId })).toMatchObject({ ok: false })
    expect(await stockAt(ids.product, ids.rack)).toBe(1)
  })
})
