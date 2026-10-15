import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { createUom } from "@/app/(app)/master/satuan/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  products,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, pgErrorInSavepoint, withLine } from "./helpers"

// Satuan khusus produk dan pembulatan (backlog R-03). Data uji berawalan ZU.

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

const ids = {} as Record<
  "count" | "weight" | "pcs" | "kg" | "a" | "b" | "adjustment" | "rack" | "warehouse",
  string
>

beforeAll(async () => {
  const [count, weight] = await db
    .insert(uomCategories)
    .values([
      { code: "ZUCNT", name: "Jumlah uji" },
      { code: "ZUWGT", name: "Berat uji" },
    ])
    .returning({ id: uomCategories.id })
  ids.count = count.id
  ids.weight = weight.id
  const [pcs, kg] = await db
    .insert(uoms)
    .values([
      { code: "ZUPCS", name: "Buah", categoryId: count.id, factor: "1", isReference: true },
      { code: "ZUKG", name: "Kilogram", categoryId: weight.id, factor: "1", isReference: true },
    ])
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  ids.kg = kg.id
  const [a, b] = await db
    .insert(products)
    .values([
      { sku: "ZUA", name: "Baut", category: "raw_material", uomId: pcs.id },
      { sku: "ZUB", name: "Mur", category: "raw_material", uomId: pcs.id },
    ])
    .returning({ id: products.id })
  ids.a = a.id
  ids.b = b.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZUG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  ids.warehouse = warehouse.id
  const [adjustment, rack] = await db
    .insert(locations)
    .values([
      { code: "ZUADJ", name: "Penyesuaian", type: "adjustment" as const },
      { code: "ZURAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.adjustment = adjustment.id
  ids.rack = rack.id
})

beforeEach(() => loginAs(["administrator"]))

afterAll(async () => {
  // Satuan khusus dulu (merujuk produk), lalu produk, lalu satuan umum.
  await db.delete(uoms).where(sql`${uoms.code} like 'ZU%' and ${uoms.productId} is not null`)
  await db.delete(products).where(like(products.sku, "ZU%"))
  await db.delete(uoms).where(like(uoms.code, "ZU%"))
  await db.delete(locations).where(like(locations.code, "ZU%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZU%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZU%"))
  await db.$client.end()
})

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

// Baris draft penyesuaian tambah; qty dalam satuan stok dihitung database.
async function moveQty(tx: Tx, productId: string, inputQty: string, uomId: string) {
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type: "adjustment",
      sourceLocationId: ids.adjustment,
      destinationLocationId: ids.rack,
    })
    .returning({ id: transfers.id })
  const [move] = await tx
    .insert(stockMoves)
    .values(
      await withLine(tx, {
        transferId: transfer.id,
        productId,
        inputQty,
        inputUomId: uomId,
        sourceLocationId: ids.adjustment,
        destinationLocationId: ids.rack,
      }),
    )
    .returning({ qty: stockMoves.qty })
  return move.qty
}

describe("satuan khusus produk", () => {
  test("hanya bisa dipakai produknya; kode sama boleh untuk produk lain", async () => {
    expect(
      await createUom(
        null,
        form({ categoryId: ids.count, code: "ZUBOX", name: "Box", factor: "24", productId: ids.a }),
      ),
    ).toMatchObject({ ok: true })
    expect(
      await createUom(
        null,
        form({ categoryId: ids.count, code: "ZUBOX", name: "Box", factor: "10", productId: ids.b }),
      ),
    ).toMatchObject({ ok: true })

    const [boxA] = await db
      .select({ id: uoms.id })
      .from(uoms)
      .where(sql`${uoms.code} = 'ZUBOX' and ${uoms.productId} = ${ids.a}`)
    await inRollback(db, async (tx) => {
      expect(await moveQty(tx, ids.a, "2", boxA.id)).toBe("48.0000")
      expect(await pgErrorInSavepoint(tx, (sp) => moveQty(sp, ids.b, "1", boxA.id))).toBe(
        "Satuan ZUBOX hanya untuk produk lain, tidak bisa dipakai untuk produk ZUB.",
      )
    })
  })

  test("kode satuan umum dan satuan khusus tidak boleh sama", async () => {
    await db
      .insert(uoms)
      .values({ code: "ZULSN", name: "Lusin", categoryId: ids.count, factor: "12" })
    expect(
      await createUom(
        null,
        form({
          categoryId: ids.count,
          code: "ZULSN",
          name: "Lusin",
          factor: "12",
          productId: ids.a,
        }),
      ),
    ).toMatchObject({ ok: false, errors: ["Kode satuan ZULSN sudah dipakai."] })
    // Database menolak juga, dua arah.
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.insert(uoms).values({
            code: "ZULSN",
            name: "Lusin",
            categoryId: ids.count,
            factor: "12",
            productId: ids.a,
          }),
        ),
      ).toBe("Kode satuan ZULSN sudah dipakai satuan umum.")
      await tx.insert(uoms).values({
        code: "ZUPAK",
        name: "Pak",
        categoryId: ids.count,
        factor: "6",
        productId: ids.a,
      })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .insert(uoms)
            .values({ code: "ZUPAK", name: "Pak", categoryId: ids.count, factor: "6" }),
        ),
      ).toBe("Kode satuan ZUPAK sudah dipakai sebagai satuan khusus produk.")
    })
  })

  test("satuan khusus sekategori dengan satuan stok; satuan stok selalu satuan umum", async () => {
    expect(
      await createUom(
        null,
        form({
          categoryId: ids.weight,
          code: "ZUKARUNG",
          name: "Karung",
          factor: "50",
          productId: ids.a,
        }),
      ),
    ).toMatchObject({
      ok: false,
      errors: ["Satuan khusus harus sekategori dengan satuan stok produknya."],
    })
    const [special] = await db
      .select({ id: uoms.id })
      .from(uoms)
      .where(sql`${uoms.code} = 'ZUBOX' and ${uoms.productId} = ${ids.a}`)
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.insert(products).values({ sku: "ZUC", name: "X", category: "wip", uomId: special.id }),
        ),
      ).toBe("Satuan stok harus satuan umum, bukan satuan khusus produk.")
    })
  })
})

test("hasil konversi dibulatkan ke pembulatan satuan stok", async () => {
  await inRollback(db, async (tx) => {
    const [lusin] = await tx
      .insert(uoms)
      .values({ code: "ZULSN2", name: "Lusin", categoryId: ids.count, factor: "12" })
      .returning({ id: uoms.id })
    expect(await moveQty(tx, ids.a, "0,3".replace(",", "."), lusin.id)).toBe("3.6000")
    await tx.update(uoms).set({ rounding: "1" }).where(eq(uoms.id, ids.pcs))
    expect(await moveQty(tx, ids.a, "0.3", lusin.id)).toBe("4.0000")
  })
})
