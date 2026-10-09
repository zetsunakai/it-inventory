import { and, desc, eq, like } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { createProduct, updateProduct } from "@/app/(app)/master/produk/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, products, refCodes, uomCategories, uoms } from "@/server/db/schema"
import { listProducts } from "@/server/queries/products"

import { inRollback, pgErrorMessage } from "./helpers"

// Produk (backlog M1-05): produk tanpa kode HS atau satuan CEISA belum siap dokumen BC.

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
  return session.user
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

// Kode HS uji di bab 99 (nasional) supaya tidak bentrok dengan data lain.
const HS = "99990001"
let pcs: string
let archivedUom: string

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZQPRD", name: "Kategori produk uji" })
    .returning({ id: uomCategories.id })
  const [unit] = await db
    .insert(uoms)
    .values({
      code: "ZQPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  pcs = unit.id
  const [archived] = await db
    .insert(uoms)
    .values({ code: "ZQOLD", name: "Lama", categoryId: category.id, factor: "2", active: false })
    .returning({ id: uoms.id })
  archivedUom = archived.id
  await db.insert(refCodes).values([
    { type: "hs_code", code: HS, name: "Barang uji" },
    { type: "ceisa_unit", code: "ZQU", name: "Satuan uji" },
  ])
})

afterAll(async () => {
  await db.delete(products).where(like(products.sku, "ZQ%"))
  await db.delete(uoms).where(like(uoms.code, "ZQ%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZQ%"))
  await db.delete(refCodes).where(like(refCodes.code, "ZQ%"))
  await db.delete(refCodes).where(eq(refCodes.code, HS))
  await db.$client.end()
})

beforeEach(() => loginAs(["administrator"]))

const BASE = { name: "Produk uji", category: "raw_material" }

describe("customs_ready", () => {
  test("dihitung database dari kode HS, satuan CEISA, dan faktornya", async () => {
    await inRollback(db, async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({ sku: "ZQR1", name: "X", category: "wip", uomId: pcs })
        .returning()
      expect(row.customsReady).toBe(false)

      const [ready] = await tx
        .update(products)
        .set({ hsCode: HS, ceisaUnitCode: "ZQU", ceisaFactor: "1" })
        .where(eq(products.id, row.id))
        .returning()
      expect(ready.customsReady).toBe(true)

      const [notReady] = await tx
        .update(products)
        .set({ hsCode: null })
        .where(eq(products.id, row.id))
        .returning()
      expect(notReady.customsReady).toBe(false)
    })
  })
})

describe("aturan tabel produk", () => {
  test("kode HS 8 digit; satuan CEISA dan faktor berpasangan; faktor positif", async () => {
    for (const [values, constraint] of [
      [{ hsCode: "1234" }, "products_hs_code_format"],
      [{ ceisaUnitCode: "ZQU" }, "products_ceisa_unit_with_factor"],
      [{ ceisaUnitCode: "ZQU", ceisaFactor: "0" }, "products_ceisa_factor_positive"],
    ] as const) {
      await inRollback(db, async (tx) => {
        const message = await pgErrorMessage(
          tx
            .insert(products)
            .values({ sku: "ZQC", name: "X", category: "wip", uomId: pcs, ...values }),
        )
        expect(message).toContain(constraint)
      })
    }
  })

  test("SKU dan satuan stok tidak bisa diubah", async () => {
    for (const [change, message] of [
      [{ sku: "ZQBARU" }, "SKU produk tidak bisa diubah."],
      [{ uomId: archivedUom }, "Satuan stok produk tidak bisa diubah."],
    ] as const) {
      await inRollback(db, async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({ sku: "ZQIMM", name: "X", category: "wip", uomId: pcs })
          .returning()
        expect(
          await pgErrorMessage(tx.update(products).set(change).where(eq(products.id, row.id))),
        ).toContain(message)
      })
    }
  })
})

describe("aksi produk", () => {
  test("produk lengkap siap dokumen BC; tanpa kode HS belum siap; tercatat di audit", async () => {
    const admin = loginAs(["administrator"])
    const ready = await createProduct(
      null,
      form({
        ...BASE,
        sku: "ZQP1",
        uomId: pcs,
        hsCode: HS,
        ceisaUnitCode: "ZQU",
        ceisaFactor: "1",
        netWeight: "0,25",
        lotRequired: "on",
      }),
    )
    expect(ready).toMatchObject({ ok: true, data: { sku: "ZQP1" } })
    const notReady = await createProduct(null, form({ ...BASE, sku: "ZQP2", uomId: pcs }))
    expect(notReady).toMatchObject({ ok: true })

    const rows = await db.select().from(products).where(like(products.sku, "ZQP%"))
    expect(Object.fromEntries(rows.map((row) => [row.sku, row.customsReady]))).toEqual({
      ZQP1: true,
      ZQP2: false,
    })
    expect(rows.find((row) => row.sku === "ZQP1")).toMatchObject({
      netWeight: "0.250000",
      lotRequired: true,
    })

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "products"), eq(auditLogs.userId, admin.id)))
      .orderBy(desc(auditLogs.id))
      .limit(1)
    expect(log).toMatchObject({ action: "INSERT" })
  })

  test("daftar produk bisa disaring menurut kesiapan dokumen BC", async () => {
    const list = async (customsReady: boolean) =>
      (
        await listProducts({ search: "ZQP", customsReady, page: 1, pageSize: 20, offset: 0 })
      ).rows.map((row) => row.sku)
    expect(await list(true)).toEqual(["ZQP1"])
    expect(await list(false)).toEqual(["ZQP2"])
  })

  test("kode HS dan satuan CEISA harus ada di referensi; satuan stok harus aktif; SKU unik", async () => {
    const result = await createProduct(
      null,
      form({
        ...BASE,
        sku: "ZQP1",
        uomId: archivedUom,
        hsCode: "99990999",
        ceisaUnitCode: "ZQTIDAK",
        ceisaFactor: "1",
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [
        "SKU ZQP1 sudah dipakai.",
        "Kode HS 99990999 tidak ada di referensi kepabeanan.",
        "Satuan CEISA ZQTIDAK tidak ada di referensi kepabeanan.",
        "Satuan stok tidak ditemukan atau sudah diarsipkan.",
      ],
    })
  })

  test("satuan CEISA tanpa faktor (dan sebaliknya) ditolak di validasi form", async () => {
    const missingFactor = await createProduct(
      null,
      form({ ...BASE, sku: "ZQP3", uomId: pcs, ceisaUnitCode: "ZQU" }),
    )
    expect(missingFactor).toMatchObject({
      ok: false,
      fieldErrors: { ceisaFactor: ["Faktor satuan CEISA wajib diisi bila satuan CEISA dipilih."] },
    })

    const missingUnit = await createProduct(
      null,
      form({ ...BASE, sku: "ZQP3", uomId: pcs, ceisaFactor: "2" }),
    )
    expect(missingUnit).toMatchObject({
      ok: false,
      fieldErrors: { ceisaUnitCode: ["Pilih satuan CEISA untuk faktor yang diisi."] },
    })
  })

  test("mengosongkan kode HS membuat produk kembali belum siap", async () => {
    const [row] = await db.select().from(products).where(eq(products.sku, "ZQP1"))
    const result = await updateProduct(
      null,
      form({ ...BASE, id: row.id, ceisaUnitCode: "ZQU", ceisaFactor: "1", active: "on" }),
    )
    expect(result).toMatchObject({ ok: true, data: { sku: "ZQP1" } })
    const [after] = await db.select().from(products).where(eq(products.id, row.id))
    expect(after).toMatchObject({ hsCode: null, customsReady: false })
  })

  test("peran selain Administrator tidak bisa menambah produk", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const result = await createProduct(null, form({ ...BASE, sku: "ZQNO", uomId: pcs }))
      expect(result.ok).toBe(false)
    }
  })
})
