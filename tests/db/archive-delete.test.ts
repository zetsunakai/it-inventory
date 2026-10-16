import { and, eq, like } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import {
  createLocation,
  deleteLocation,
  deleteWarehouse,
  importLocations,
  updateLocation,
} from "@/app/(app)/master/gudang/actions"
import { deletePartner } from "@/app/(app)/master/partner/actions"
import { deleteProduct } from "@/app/(app)/master/produk/actions"
import { createUom, deleteUom } from "@/app/(app)/master/satuan/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  auditLogs,
  locations,
  partners,
  products,
  uomCategories,
  uoms,
  users,
  userWarehouses,
  warehouses,
} from "@/server/db/schema"
import { listProducts } from "@/modules/inventory/server/queries/products"

// Arsip vs hapus (backlog M1-08): data yang sudah dipakai hanya bisa diarsipkan, dan data arsip
// tidak bisa dipilih untuk data baru. Semua data uji berawalan ZD.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "User Tes",
    email: "tes@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

let category: string
let archivedCategory: string
let referenceUom: string

beforeAll(async () => {
  const rows = await db
    .insert(uomCategories)
    .values([
      { code: "ZDCAT", name: "Kategori hapus uji" },
      { code: "ZDOLD", name: "Kategori arsip uji", active: false },
    ])
    .returning({ id: uomCategories.id })
  ;[category, archivedCategory] = rows.map((row) => row.id)
  const [reference] = await db
    .insert(uoms)
    .values({ code: "ZDPCS", name: "Buah", categoryId: category, factor: "1", isReference: true })
    .returning({ id: uoms.id })
  referenceUom = reference.id
})

beforeEach(() => loginAs(["administrator"]))

afterEach(async () => {
  await db.delete(products).where(like(products.sku, "ZD%"))
  await db.delete(partners).where(like(partners.code, "ZD%"))
  await db.update(locations).set({ parentId: null }).where(like(locations.code, "ZD%"))
  await db.delete(locations).where(like(locations.code, "ZD%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZD%"))
  await db.delete(uoms).where(and(like(uoms.code, "ZD%"), eq(uoms.isReference, false)))
})

afterAll(async () => {
  await db.delete(uoms).where(like(uoms.code, "ZD%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZD%"))
  await db.delete(users).where(like(users.email, "zd-%@hapus.test"))
  await db.$client.end()
})

async function product(sku: string, uomId = referenceUom, active = true) {
  const [row] = await db
    .insert(products)
    .values({ sku, name: `Produk ${sku}`, category: "wip", uomId, active })
    .returning({ id: products.id })
  return row.id
}

async function warehouse(code: string, active = true) {
  const [row] = await db
    .insert(warehouses)
    .values({
      code,
      name: `Gudang ${code}`,
      address: "Bekasi",
      active,
    })
    .returning({ id: warehouses.id })
  return row.id
}

async function location(code: string, warehouseId: string, parentId?: string, active = true) {
  const [row] = await db
    .insert(locations)
    .values({ code, name: `Lokasi ${code}`, type: "internal", warehouseId, parentId, active })
    .returning({ id: locations.id })
  return row.id
}

const USED = "jadi tidak bisa dihapus. Arsipkan saja supaya tidak muncul di pilihan baru."

describe("hapus data yang belum dipakai", () => {
  test("produk dan partner yang belum dipakai terhapus, tercatat di audit log", async () => {
    const productId = await product("ZDP1")
    const [partner] = await db
      .insert(partners)
      .values({
        code: "ZDV1",
        name: "PT Hapus",
        address: "Bekasi",
        countryCode: "ID",
        identityType: "passport",
        identityNumber: "ZD12345",
      })
      .returning({ id: partners.id })

    expect(await deleteProduct({ id: productId })).toMatchObject({ ok: true })
    expect(await deletePartner({ id: partner.id })).toMatchObject({ ok: true })
    expect(await db.select().from(products).where(eq(products.id, productId))).toEqual([])

    const audit = await db
      .select({ action: auditLogs.action, userId: auditLogs.userId })
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "products"), eq(auditLogs.recordId, productId)))
    expect(audit).toContainEqual({ action: "DELETE", userId: session.user!.id })
  })

  test("satuan yang dipakai produk ditolak database; satuan acuan tidak bisa dihapus", async () => {
    const [box] = await db
      .insert(uoms)
      .values({ code: "ZDBOX", name: "Kotak", categoryId: category, factor: "10" })
      .returning({ id: uoms.id })
    await product("ZDP1", box.id)

    expect(await deleteUom({ id: box.id })).toEqual({
      ok: false,
      errors: [`Satuan ini masih dipakai di data produk, ${USED}`],
    })
    expect(await db.select().from(uoms).where(eq(uoms.id, box.id))).toHaveLength(1)

    expect(await deleteUom({ id: referenceUom })).toEqual({
      ok: false,
      errors: ["Satuan acuan tidak bisa dihapus. Arsipkan saja bila tidak dipakai lagi."],
    })

    await db.delete(products).where(eq(products.sku, "ZDP1"))
    expect(await deleteUom({ id: box.id })).toMatchObject({ ok: true })
  })

  test("gudang dengan lokasi ditolak; gudang kosong terhapus beserta akses usernya", async () => {
    const used = await warehouse("ZDG1")
    await location("ZDL1", used)
    expect(await deleteWarehouse({ id: used })).toEqual({
      ok: false,
      errors: [`Gudang ini masih dipakai di data lokasi, ${USED}`],
    })

    const empty = await warehouse("ZDG2")
    const [user] = await db
      .insert(users)
      .values({ name: "Uji hapus", email: "zd-gudang@hapus.test", emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userWarehouses).values({ userId: user.id, warehouseId: empty })
    expect(await deleteWarehouse({ id: empty })).toMatchObject({ ok: true })
    expect(
      await db.select().from(userWarehouses).where(eq(userWarehouses.warehouseId, empty)),
    ).toEqual([])
  })

  test("lokasi dengan anak dan lokasi virtual tidak bisa dihapus", async () => {
    const warehouseId = await warehouse("ZDG1")
    const rack = await location("ZDRAK", warehouseId)
    const bin = await location("ZDBIN", warehouseId, rack)

    expect(await deleteLocation({ id: rack })).toEqual({
      ok: false,
      errors: [
        "Lokasi ini masih punya lokasi di bawahnya (ZDBIN). Hapus atau pindahkan dulu lokasi itu, atau arsipkan saja.",
      ],
    })
    expect(await deleteLocation({ id: bin })).toMatchObject({ ok: true })
    expect(await deleteLocation({ id: rack })).toMatchObject({ ok: true })

    const [vendor] = await db
      .insert(locations)
      .values({ code: "ZDVENDOR", name: "Vendor uji", type: "vendor" })
      .returning({ id: locations.id })
    expect(await deleteLocation({ id: vendor.id })).toEqual({
      ok: false,
      errors: ["Lokasi virtual dibuat oleh sistem dan tidak bisa dihapus."],
    })
  })

  test("hanya peran dengan master:write yang boleh menghapus", async () => {
    const productId = await product("ZDP1")
    loginAs(["manajer"])
    expect(await deleteProduct({ id: productId })).toMatchObject({ ok: false })
    expect(await db.select().from(products).where(eq(products.id, productId))).toHaveLength(1)
  })
})

describe("data arsip tidak bisa dipilih untuk data baru", () => {
  test("lokasi baru di gudang arsip atau di bawah induk arsip ditolak", async () => {
    const archived = await warehouse("ZDG0", false)
    const active = await warehouse("ZDG1")
    const archivedParent = await location("ZDOLD", active, undefined, false)

    expect(
      await createLocation(
        null,
        form({ warehouseId: archived, code: "ZDN1", name: "Baru", type: "internal" }),
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Gudang ini diarsipkan. Aktifkan dulu untuk menambah lokasi."],
    })
    expect(
      await createLocation(
        null,
        form({
          warehouseId: active,
          code: "ZDN2",
          name: "Baru",
          type: "internal",
          parentId: archivedParent,
        }),
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Lokasi induk tidak ditemukan atau sudah diarsipkan."],
    })
  })

  test("induk arsip yang sudah tersimpan tetap boleh, induk arsip baru ditolak", async () => {
    const warehouseId = await warehouse("ZDG1")
    const oldParent = await location("ZDOLD", warehouseId)
    const otherArchived = await location("ZDOLD2", warehouseId, undefined, false)
    const child = await location("ZDCHILD", warehouseId, oldParent)
    await db.update(locations).set({ active: false }).where(eq(locations.id, oldParent))

    const keep = await updateLocation(
      null,
      form({ id: child, name: "Ganti nama", parentId: oldParent, active: "on" }),
    )
    expect(keep).toMatchObject({ ok: true })

    const move = await updateLocation(
      null,
      form({ id: child, name: "Ganti nama", parentId: otherArchived, active: "on" }),
    )
    expect(move).toMatchObject({
      ok: false,
      errors: ["Lokasi induk tidak ditemukan atau sudah diarsipkan."],
    })
  })

  test("satuan baru di kategori arsip ditolak", async () => {
    const result = await createUom(
      null,
      form({ categoryId: archivedCategory, code: "ZDX", name: "X", factor: "2" }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: ["Kategori satuan tidak ditemukan atau sudah diarsipkan."],
    })
  })

  test("import lokasi menolak gudang arsip dan induk arsip", async () => {
    await warehouse("ZDG0", false)
    const active = await warehouse("ZDG1")
    await location("ZDOLD", active, undefined, false)
    const file = new File(
      [
        [
          "Kode;Nama;Tipe;Gudang;Induk",
          "ZDN1;Satu;Internal;ZDG0;",
          "ZDN2;Dua;Internal;ZDG1;ZDOLD",
        ].join("\n"),
      ],
      "lokasi.csv",
    )
    const data = new FormData()
    data.set("file", file)
    const result = await importLocations(null, data)
    expect(result).toMatchObject({
      ok: true,
      data: {
        status: "invalid",
        errors: [
          {
            line: 2,
            messages: ["Gudang ZDG0 diarsipkan. Aktifkan dulu untuk menambah lokasi."],
          },
          { line: 3, messages: ["Lokasi induk ZDOLD diarsipkan."] },
        ],
      },
    })
  })
})

test("filter status di daftar master: aktif, arsip, atau semua", async () => {
  await product("ZDA1")
  await product("ZDA2", referenceUom, false)
  const page = { search: "ZDA", page: 1, pageSize: 20, offset: 0 }
  const skus = async (active?: boolean) =>
    (await listProducts({ ...page, active })).rows.map((row) => row.sku)

  expect(await skus(true)).toEqual(["ZDA1"])
  expect(await skus(false)).toEqual(["ZDA2"])
  expect(await skus()).toEqual(["ZDA1", "ZDA2"])
})
