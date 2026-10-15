import { eq, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import {
  createProductCategory,
  deleteProductCategory,
  updateProductCategory,
} from "@/app/(app)/master/kategori-produk/actions"
import { createProduct, importProducts } from "@/app/(app)/master/produk/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  numberSequences,
  productCategories,
  products,
  uomCategories,
  uoms,
} from "@/server/db/schema"
import { exportProducts } from "@/server/master-io/products"
import { listProductCategories } from "@/server/queries/product-categories"

import { inRollback, pgErrorMessage } from "./helpers"

// Kategori produk bertingkat dan SKU otomatis (backlog R-01). Data uji berawalan ZK (SKU dan
// prefix) atau "ZK " (nama kategori).

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

let pcs: string

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZKUOM", name: "Satuan uji kategori" })
    .returning({ id: uomCategories.id })
  const [unit] = await db
    .insert(uoms)
    .values({
      code: "ZKPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  pcs = unit.id
})

beforeEach(() => loginAs(["administrator"]))

afterEach(async () => {
  await db.delete(products).where(like(products.sku, "ZK%"))
  // Anak dulu: foreign key induk bersifat restrict.
  const categories = await db.execute<{ id: string }>(sql`
    select c.id from product_categories c join product_category_paths p on p.id = c.id
    where c.name like 'ZK %' order by p.depth desc`)
  for (const { id } of categories.rows) {
    await db.delete(productCategories).where(eq(productCategories.id, id))
    await db.delete(numberSequences).where(eq(numberSequences.scope, `sku:${id}`))
  }
})

afterAll(async () => {
  await db.delete(uoms).where(like(uoms.code, "ZK%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZK%"))
  await db.$client.end()
})

async function category(values: Record<string, string>) {
  const result = await createProductCategory(null, form({ codeDigits: "6", ...values }))
  if (!result.ok) throw new Error(result.errors.join(" | "))
  return result.data.id
}

async function newProduct(values: Record<string, string>) {
  return createProduct(
    null,
    form({ name: "Produk uji", category: "raw_material", uomId: pcs, ...values }),
  )
}

describe("kategori produk", () => {
  test("bertingkat: jalur lengkap dan urutan induk sebelum anak", async () => {
    const root = await category({ name: "ZK Bahan baku", codePrefix: "zk-bb" })
    const child = await category({ name: "ZK Logam", parentId: root })
    await category({ name: "ZK Baut", parentId: child })

    const { rows } = await listProductCategories({
      search: "ZK ",
      page: 1,
      pageSize: 50,
      offset: 0,
    })
    expect(rows.map((row) => [row.path, row.depth, row.codePrefix])).toEqual([
      ["ZK Bahan baku", 0, "ZK-BB"],
      ["ZK Bahan baku / ZK Logam", 1, null],
      ["ZK Bahan baku / ZK Logam / ZK Baut", 2, null],
    ])
  })

  test("nama unik di induk yang sama, prefix unik; semua kesalahan tampil sekaligus", async () => {
    const root = await category({ name: "ZK Induk", codePrefix: "ZKA" })
    await category({ name: "ZK Anak", parentId: root })
    // Nama sama di induk lain boleh.
    await category({ name: "ZK Anak" })

    const result = await createProductCategory(
      null,
      form({ name: "zk anak", parentId: root, codePrefix: "zka", codeDigits: "2" }),
    )
    expect(result).toMatchObject({ ok: false, errors: ["Jumlah digit minimal 3."] })

    const taken = await createProductCategory(
      null,
      form({ name: "zk anak", parentId: root, codePrefix: "zka", codeDigits: "6" }),
    )
    expect(taken).toMatchObject({
      ok: false,
      errors: [
        "Nama kategori zk anak sudah dipakai di induk yang sama.",
        "Prefix kode ZKA sudah dipakai kategori ZK Induk.",
      ],
    })

    const slash = await createProductCategory(null, form({ name: "ZK A/B", codeDigits: "6" }))
    expect(slash).toMatchObject({ ok: false, errors: ["Nama kategori tidak boleh berisi /."] })
  })

  test("induk tidak boleh membentuk lingkaran atau berupa kategori arsip", async () => {
    const root = await category({ name: "ZK Akar" })
    const child = await category({ name: "ZK Cabang", parentId: root })

    const loop = await updateProductCategory(
      null,
      form({ id: root, name: "ZK Akar", parentId: child, codeDigits: "6", active: "on" }),
    )
    expect(loop).toMatchObject({
      ok: false,
      errors: ["Kategori induk tidak boleh berada di bawah kategori ini sendiri."],
    })

    await db.update(productCategories).set({ active: false }).where(eq(productCategories.id, root))
    const archivedParent = await createProductCategory(
      null,
      form({ name: "ZK Baru", parentId: root, codeDigits: "6" }),
    )
    expect(archivedParent).toMatchObject({
      ok: false,
      errors: ["Kategori induk tidak ditemukan atau sudah diarsipkan."],
    })
    // Kategori yang sudah di bawah induk arsip tetap bisa disimpan.
    const keep = await updateProductCategory(
      null,
      form({ id: child, name: "ZK Cabang 2", parentId: root, codeDigits: "6", active: "on" }),
    )
    expect(keep).toMatchObject({ ok: true })
  })

  test("kategori yang punya produk atau sub-kategori tidak bisa dihapus", async () => {
    const root = await category({ name: "ZK Hapus", codePrefix: "ZKH" })
    await category({ name: "ZK Sub", parentId: root })
    expect(await deleteProductCategory({ id: root })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("masih dipakai di data kategori produk")],
    })

    const leaf = await category({ name: "ZK Daun" })
    await db.insert(products).values({
      sku: "ZKD1",
      name: "X",
      category: "wip",
      uomId: pcs,
      categoryId: leaf,
    })
    expect(await deleteProductCategory({ id: leaf })).toMatchObject({
      ok: false,
      errors: [expect.stringContaining("masih dipakai di data produk")],
    })

    const unused = await category({ name: "ZK Kosong" })
    expect(await deleteProductCategory({ id: unused })).toMatchObject({ ok: true })
  })
})

describe("SKU otomatis", () => {
  test("SKU kosong dibuat dari prefix + nomor urut kategori; SKU manual tetap boleh", async () => {
    const id = await category({ name: "ZK Otomatis", codePrefix: "ZKO-", codeDigits: "4" })
    expect(await newProduct({ sku: "", categoryId: id })).toMatchObject({
      ok: true,
      data: { sku: "ZKO-0001" },
    })
    // SKU manual yang kebetulan sama dengan nomor berikutnya dilewati.
    expect(await newProduct({ sku: "ZKO-0002", categoryId: id })).toMatchObject({ ok: true })
    expect(await newProduct({ sku: "", categoryId: id })).toMatchObject({
      ok: true,
      data: { sku: "ZKO-0003" },
    })
  })

  test("dua produk yang dibuat bersamaan di kategori yang sama mendapat SKU berbeda", async () => {
    const id = await category({ name: "ZK Bersamaan", codePrefix: "ZKC" })
    const results = await Promise.all(
      Array.from({ length: 5 }, () => newProduct({ sku: "", categoryId: id })),
    )
    const skus = results.map((result) => (result.ok ? result.data.sku : result.errors.join()))
    expect(new Set(skus).size).toBe(5)
    expect(skus.toSorted()).toEqual([
      "ZKC000001",
      "ZKC000002",
      "ZKC000003",
      "ZKC000004",
      "ZKC000005",
    ])
  })

  test("nomor yang lebih panjang dari jumlah digit tidak dipotong", async () => {
    const id = await category({ name: "ZK Panjang", codePrefix: "ZKP", codeDigits: "3" })
    await db.insert(numberSequences).values({ scope: `sku:${id}`, period: "", lastValue: 999 })
    expect(await newProduct({ sku: "", categoryId: id })).toMatchObject({
      ok: true,
      data: { sku: "ZKP1000" },
    })
  })

  test("SKU kosong ditolak bila kategori tidak dipilih atau tidak punya prefix", async () => {
    expect(await newProduct({ sku: "" })).toMatchObject({
      ok: false,
      errors: ["Product code wajib diisi bila kategori produk tidak dipilih."],
    })
    const manual = await category({ name: "ZK Manual" })
    expect(await newProduct({ sku: "", categoryId: manual })).toMatchObject({
      ok: false,
      errors: [
        "Product code wajib diisi karena kategori produk ZK Manual tidak punya prefix kode.",
      ],
    })
    // Database menolak juga bila aplikasi melewatkan pemeriksaan.
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorMessage(
          tx.insert(products).values({ sku: "", name: "X", category: "wip", uomId: pcs }),
        ),
      ).toContain("SKU wajib diisi bila kategori produk tidak dipilih.")
    })
  })

  test("kategori arsip tidak bisa dipilih untuk produk", async () => {
    const id = await category({ name: "ZK Arsip", codePrefix: "ZKR" })
    await db.update(productCategories).set({ active: false }).where(eq(productCategories.id, id))
    expect(await newProduct({ sku: "ZKR1", categoryId: id })).toMatchObject({
      ok: false,
      errors: ["Kategori produk tidak ditemukan atau sudah diarsipkan."],
    })
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorMessage(
          tx
            .insert(products)
            .values({ sku: "ZKR2", name: "X", category: "wip", uomId: pcs, categoryId: id }),
        ),
      ).toContain("Kategori produk sudah diarsipkan.")
    })
  })
})

test("import dan export produk memakai jalur kategori produk", async () => {
  const root = await category({ name: "ZK Impor" })
  const child = await category({ name: "ZK Plastik", parentId: root })
  const file = new File(
    [
      [
        "SKU;Nama;Kategori produk;Kategori IT Inventory;Satuan stok",
        "ZKI1;Tutup;zk impor/ZK plastik;Bahan baku;ZKPCS",
        "ZKI2;Wadah;ZK Tidak Ada;Bahan baku;ZKPCS",
      ].join("\r\n"),
    ],
    "p.csv",
    { type: "text/csv" },
  )
  const data = new FormData()
  data.set("file", file)
  const rejected = await importProducts(null, data)
  expect(rejected).toMatchObject({
    ok: true,
    data: {
      status: "invalid",
      errors: [
        expect.objectContaining({
          messages: ['Kategori produk "ZK Tidak Ada" tidak ditemukan atau sudah diarsipkan.'],
        }),
      ],
    },
  })

  const fixed = new FormData()
  fixed.set(
    "file",
    new File(
      [
        [
          "SKU;Nama;Kategori produk;Kategori IT Inventory;Satuan stok",
          "ZKI1;Tutup;zk impor/ZK plastik;Bahan baku;ZKPCS",
        ].join("\r\n"),
      ],
      "p.csv",
      { type: "text/csv" },
    ),
  )
  expect(await importProducts(null, fixed)).toMatchObject({ ok: true, data: { created: 1 } })
  const [saved] = await db.select().from(products).where(eq(products.sku, "ZKI1"))
  expect(saved.categoryId).toBe(child)

  const exported = await exportProducts("csv")
  const text = Buffer.from(exported as Uint8Array).toString("utf8")
  expect(text).toContain("Kategori produk")
  expect(text).toContain("ZKI1,Tutup,,ZK Impor / ZK Plastik,Bahan baku,ZKPCS")
})
