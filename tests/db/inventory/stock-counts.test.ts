import { and, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import {
  addCountLine,
  approveStockCount,
  cancelStockCount,
  completeStockCount,
  createStockCount,
  importStockCount,
  recordCount,
  rejectStockCount,
  reopenStockCount,
  scanCountItem,
  startStockCount,
  submitStockCount,
} from "@/modules/inventory/actions/stock-counts"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  partners,
  productCategories,
  products,
  stockBalances,
  stockCountLines,
  stockCountProducts,
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

import { pgErrorMessage, purgeInventory, withLine } from "../../shared/db/helpers"

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
    await tx
      .delete(stockCountProducts)
      .where(inArray(stockCountProducts.productId, [ids.product, ids.other]))
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

// Sesi baru (Draft) lalu, kecuali start = false, langsung dimulai (gudang dibekukan).
async function newCount(values: Record<string, string> = {}, start = true) {
  loginAs("manajer")
  const result = await createStockCount(null, form({ warehouseId: ids.warehouse, ...values }))
  if (!result.ok) throw new Error(result.errors.join(" | "))
  if (start) {
    const started = await startStockCount({ id: result.data.id })
    if (!started.ok) throw new Error(started.errors.join(" | "))
  }
  return result.data.id
}

async function status(countId: string) {
  const [row] = await db
    .select({ status: stockCounts.status })
    .from(stockCounts)
    .where(eq(stockCounts.id, countId))
  return row.status
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

describe("membuat dan memulai sesi", () => {
  test("Draft tanpa daftar hitung; mulai hitung mengambil saldo di lingkup sesi sebagai qty sistem", async () => {
    await receive(ids.product, ids.rack, "10")
    await receive(ids.other, ids.bin, "4")
    await receive(ids.product, ids.elsewhere, "7")

    const rackOnly = await newCount({ locationId: ids.rack }, false)
    const [draft] = await db.select().from(stockCounts).where(eq(stockCounts.id, rackOnly))
    expect([draft.number.slice(0, 4), draft.status, draft.createdBy]).toEqual([
      "OPN/",
      "draft",
      people.manajer.id,
    ])
    expect(await lines(rackOnly)).toEqual([])
    expect(await startStockCount({ id: rackOnly })).toMatchObject({ ok: true })
    expect(await status(rackOnly)).toBe("counting")
    expect(
      (await lines(rackOnly))
        .map((line) => [line.locationId, line.productId, line.systemQty])
        .sort(),
    ).toEqual(
      [
        [ids.rack, ids.product, "10.0000"],
        [ids.bin, ids.other, "4.0000"],
      ].sort(),
    )

    // Satu gudang hanya satu opname berjalan.
    const whole = await newCount({}, false)
    const second = await startStockCount({ id: whole })
    expect(second).toMatchObject({ ok: false })
    expect(!second.ok && second.errors[0]).toMatch(
      /^Gudang ZOG sudah punya stock opname berjalan: OPN\/\d{4}\/\d{5}\. Selesaikan atau batalkan dulu\.$/,
    )
    await cancelStockCount({ id: rackOnly })
    expect(await startStockCount({ id: whole })).toMatchObject({ ok: true })
    expect(await lines(whole)).toHaveLength(3)
  })

  test("lingkup kategori produk termasuk sub-kategorinya", async () => {
    const [parent] = await db
      .insert(productCategories)
      .values({ name: "ZO Induk" })
      .returning({ id: productCategories.id })
    const [child] = await db
      .insert(productCategories)
      .values({ name: "ZO Anak", parentId: parent.id })
      .returning({ id: productCategories.id })
    try {
      await db.update(products).set({ categoryId: child.id }).where(eq(products.id, ids.other))
      await receive(ids.product, ids.rack, "1")
      await receive(ids.other, ids.rack, "2")
      const countId = await newCount({ productCategoryId: parent.id })
      expect((await lines(countId)).map((line) => line.productId)).toEqual([ids.other])
      loginAs("gudang")
      expect(
        await addCountLine({ countId, productId: ids.product, locationId: ids.rack, lotName: "" }),
      ).toMatchObject({ ok: false, errors: ["Produk di luar kategori sesi opname."] })
    } finally {
      await purgeCounts()
      await db.update(products).set({ categoryId: null }).where(eq(products.id, ids.other))
      await db.delete(productCategories).where(eq(productCategories.id, child.id))
      await db.delete(productCategories).where(eq(productCategories.id, parent.id))
    }
  })

  test("hanya Manajer (inventory:approve) yang membuat dan memulai sesi", async () => {
    const countId = await newCount({}, false)
    loginAs("gudang")
    expect(await createStockCount(null, form({ warehouseId: ids.warehouse }))).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    expect(await startStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
  })
})

describe("pembekuan gudang", () => {
  test("transfer di gudang yang di-opname ditolak sampai opname dibatalkan atau disetujui", async () => {
    await receive(ids.product, ids.rack, "5")
    const countId = await newCount({ locationId: ids.bin })
    const [{ number }] = await db
      .select({ number: stockCounts.number })
      .from(stockCounts)
      .where(eq(stockCounts.id, countId))
    // Seluruh gudang dibekukan, walau lingkup hitungnya hanya satu lokasi.
    expect(await pgErrorMessage(receive(ids.product, ids.rack, "1"))).toBe(
      `Gudang ZOG sedang dibekukan untuk stock opname ${number}. Transfer bisa divalidasi setelah opnamenya disetujui atau dibatalkan.`,
    )
    loginAs("manajer")
    expect(await cancelStockCount({ id: countId })).toMatchObject({ ok: true })
    await receive(ids.product, ids.rack, "1")
    expect(await stockAt(ids.product, ids.rack)).toBe(6)
  })
})

describe("menghitung, mengajukan, dan menyetujui", () => {
  test("selesai hitung → ajukan → tolak → hitung ulang → setujui; selisih jadi penyesuaian bertanggal selesai hitung", async () => {
    await receive(ids.product, ids.rack, "10")
    await receive(ids.other, ids.bin, "4")
    const countId = await newCount({ locationId: ids.rack })
    const [productLine, otherLine] = (await lines(countId)).sort((a) =>
      a.productId === ids.product ? -1 : 1,
    )

    loginAs("gudang")
    expect(await recordCount({ lineId: productLine.id, qty: "8" })).toMatchObject({ ok: true })
    // Belum semua dihitung.
    const early = await completeStockCount({ id: countId })
    expect(early).toMatchObject({ ok: false })
    expect(!early.ok && early.errors[0]).toMatch(/^1 baris belum dihitung: ZOP2 di ZORAK\/ZOBIN/)
    // Belum Selesai hitung, belum bisa diajukan.
    expect(await submitStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Hanya sesi opname Selesai hitung yang bisa diajukan."],
    })

    expect(await recordCount({ lineId: otherLine.id, qty: "5,5" })).toMatchObject({ ok: true })
    expect(await completeStockCount({ id: countId })).toMatchObject({ ok: true })
    // Terkunci setelah Selesai hitung.
    expect(await recordCount({ lineId: otherLine.id, qty: "1" })).toMatchObject({
      ok: false,
      errors: ["Daftar hitung hanya bisa diubah selama sesi opname Berjalan."],
    })
    expect(await submitStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await status(countId)).toBe("review")

    expect(await rejectStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    loginAs("manajer")
    expect(await rejectStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await status(countId)).toBe("counted")
    loginAs("gudang")
    expect(await reopenStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await recordCount({ lineId: otherLine.id, qty: "5" })).toMatchObject({ ok: true })
    await completeStockCount({ id: countId })
    await submitStockCount({ id: countId })
    expect((await lines(countId)).map((line) => [line.systemQty, line.countedQty]).sort()).toEqual(
      [
        ["10.0000", "8.0000"],
        ["4.0000", "5.0000"],
      ].sort(),
    )

    expect(await approveStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    loginAs("manajer")
    expect(await approveStockCount({ id: countId })).toMatchObject({ ok: true })

    expect(await stockAt(ids.product, ids.rack)).toBe(8)
    expect(await stockAt(ids.other, ids.bin)).toBe(5)
    const [saved] = await db.select().from(stockCounts).where(eq(stockCounts.id, countId))
    expect([saved.status, saved.approvedBy]).toEqual(["approved", people.manajer.id])
    const adjustments = await db
      .select({
        number: transfers.number,
        status: transfers.status,
        reason: transfers.reason,
        approvedBy: transfers.approvedBy,
        doneAt: transfers.doneAt,
      })
      .from(transfers)
      .where(eq(transfers.stockCountId, countId))
    expect(adjustments).toHaveLength(2)
    expect(adjustments.every((row) => row.status === "done" && row.number.startsWith("ADJ/"))).toBe(
      true,
    )
    expect(adjustments[0].reason).toMatch(/^Selisih stock opname OPN\//)
    expect(adjustments.every((row) => row.approvedBy === people.manajer.id)).toBe(true)
    expect(adjustments.every((row) => row.doneAt?.getTime() === saved.completedAt?.getTime())).toBe(
      true,
    )
    // Gudang dibuka lagi.
    await receive(ids.product, ids.rack, "1")
    expect(await stockAt(ids.product, ids.rack)).toBe(9)
  })

  test("barang temuan di luar daftar: qty sistem 0, menambah stok setelah disetujui", async () => {
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
    expect((await lines(countId))[0].systemQty).toBe("0.0000")
    await recordCount({ lineId: added.data.id, qty: "2" })
    await completeStockCount({ id: countId })
    await submitStockCount({ id: countId })
    loginAs("manajer")
    expect(await approveStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await stockAt(ids.other, ids.bin)).toBe(2)
  })

  test("sesi batal terkunci dan tidak bisa dibatalkan lagi", async () => {
    await receive(ids.product, ids.rack, "1")
    const countId = await newCount({ locationId: ids.rack })
    loginAs("manajer")
    expect(await cancelStockCount({ id: countId })).toMatchObject({ ok: true })
    expect(await cancelStockCount({ id: countId })).toMatchObject({
      ok: false,
      errors: ["Sesi opname yang sudah disetujui atau dibatalkan tidak bisa dibatalkan."],
    })
    expect(await startStockCount({ id: countId })).toMatchObject({ ok: false })
    expect(await stockAt(ids.product, ids.rack)).toBe(1)
  })
})

describe("lingkup produk, isi awal, impor, dan scan (I-04)", () => {
  const csv = (rows: string[][]) =>
    new File([rows.map((row) => row.join(";")).join("\r\n")], "hitung.csv", { type: "text/csv" })
  const header = ["Lokasi", "Product code", "Nama produk", "Lot/seri", "Satuan", "Qty hitung"]

  test("produk tertentu dan produk tanpa stok ikut dihitung dengan qty hitung awal 0", async () => {
    await receive(ids.product, ids.rack, "10")
    const countId = await newCount({
      locationId: ids.rack,
      productIds: JSON.stringify([ids.other]),
      includeZeroStock: "true",
      initialCounted: "zero",
    })
    expect(
      (await lines(countId)).map((line) => [
        line.locationId,
        line.productId,
        line.systemQty,
        line.countedQty,
      ]),
    ).toEqual([[ids.rack, ids.other, "0.0000", "0.0000"]])
    loginAs("gudang")
    expect(
      await addCountLine({ countId, productId: ids.product, locationId: ids.rack, lotName: "" }),
    ).toMatchObject({ ok: false, errors: ["Produk di luar kategori sesi opname."] })
  })

  test("qty hitung awal sama dengan qty sistem; lingkup terkunci setelah Draft", async () => {
    await receive(ids.product, ids.rack, "10")
    const countId = await newCount({ initialCounted: "system" })
    expect((await lines(countId)).map((line) => [line.systemQty, line.countedQty])).toEqual([
      ["10.0000", "10.0000"],
    ])
    expect(
      await pgErrorMessage(
        db.update(stockCounts).set({ includeZeroStock: true }).where(eq(stockCounts.id, countId)),
      ),
    ).toBe("Lingkup sesi opname hanya bisa diubah selama Draft.")
  })

  test("impor hasil hitung: kesalahan per baris tanpa menyimpan, lalu baris lama diperbarui dan barang temuan ditambah", async () => {
    await receive(ids.product, ids.rack, "10")
    const countId = await newCount({ locationId: ids.rack })
    loginAs("gudang")
    const bad = form({ countId })
    bad.set(
      "file",
      csv([
        header,
        ["ZORAK", "ZOP1", "", "", "", "7"],
        ["ZOLAIN", "ZOP1", "", "", "", "1"],
        ["ZORAK", "ZOXX", "", "", "", "1"],
        ["ZORAK/ZOBIN", "ZOP1", "", "", "", "-1"],
      ]),
    )
    const wrong = await importStockCount(null, bad)
    expect(wrong).toMatchObject({
      ok: true,
      data: {
        status: "invalid",
        errors: [
          { line: 3, messages: ["Lokasi ZOLAIN di luar lingkup sesi opname."] },
          { line: 4, messages: ["Product code ZOXX tidak dikenal."] },
          {
            line: 5,
            messages: ["Qty hitung harus angka 0 atau lebih, maksimal 4 desimal."],
          },
        ],
      },
    })
    expect((await lines(countId)).map((line) => line.countedQty)).toEqual([null])

    const data = form({ countId })
    data.set(
      "file",
      csv([
        header,
        ["ZORAK", "ZOP1", "Baut", "", "PCS", "7"],
        ["ZORAK/ZOBIN", "ZOP2", "", "", "", "3"],
      ]),
    )
    expect(await importStockCount(null, data)).toMatchObject({
      ok: true,
      data: { status: "imported", total: 2, created: 1, updated: 1, unchanged: 0 },
    })
    expect(
      (await lines(countId))
        .map((line) => [line.locationId, line.productId, line.systemQty, line.countedQty])
        .sort(),
    ).toEqual(
      [
        [ids.rack, ids.product, "10.0000", "7.0000"],
        [ids.bin, ids.other, "0.0000", "3.0000"],
      ].sort(),
    )
  })

  test("scan menambah qty hitung 1; produk di beberapa lokasi butuh kode lokasi; barang temuan di lokasi terpilih", async () => {
    await receive(ids.product, ids.rack, "10")
    await receive(ids.product, ids.bin, "2")
    await receive(ids.other, ids.rack, "1")
    const countId = await newCount({ locationId: ids.rack })
    loginAs("gudang")
    const scan = (code: string, locationId: string | null = null) =>
      scanCountItem({ countId, code, locationId, lot: null })

    expect(await scan("zop2")).toMatchObject({
      ok: true,
      data: { status: "counted", qty: "1.0000" },
    })
    expect(await scan("ZOP2")).toMatchObject({ ok: true, data: { qty: "2.0000" } })
    const ambiguous = await scan("ZOP1")
    expect(!ambiguous.ok && ambiguous.errors[0]).toMatch(/^ZOP1 ada di beberapa lokasi/)
    expect(await scan("ZOP1", ids.bin)).toMatchObject({
      ok: true,
      data: { qty: "1.0000", found: false },
    })
    expect(await scan("ZOP2", ids.bin)).toMatchObject({
      ok: true,
      data: { qty: "1.0000", found: true, locationPath: expect.stringMatching(/ZOBIN$/) },
    })
    expect(await scan("TIDAKADA")).toMatchObject({
      ok: false,
      errors: ["Kode TIDAKADA bukan product code yang dikenal."],
    })
  })
})
