import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { createUom, createUomCategory, updateUom } from "@/app/(app)/master/satuan/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { uomCategories, uoms } from "@/server/db/schema"

import { inRollback, pgErrorMessage } from "./helpers"

// Satuan dan konversi (backlog M1-04).

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

const ids = {} as Record<string, string>

async function addCategory(code: string, reference: string) {
  const [category] = await db
    .insert(uomCategories)
    .values({ code, name: `Kategori ${code}` })
    .returning({ id: uomCategories.id })
  ids[code] = category.id
  await addUom(reference, category.id, "1", true)
  return category.id
}

async function addUom(code: string, categoryId: string, factor: string, isReference = false) {
  const [row] = await db
    .insert(uoms)
    .values({ code, name: code, categoryId, factor, isReference })
    .returning({ id: uoms.id })
  ids[code] = row.id
}

async function convert(qty: string, from: string, to: string) {
  const result = await db.execute(
    sql`select convert_qty(${qty}::numeric, ${ids[from]}, ${ids[to]})::text as qty`,
  )
  return (result.rows[0] as { qty: string }).qty
}

beforeAll(async () => {
  const weight = await addCategory("ZQBERAT", "ZQKG")
  await addUom("ZQG", weight, "0.001")
  await addUom("ZQTON", weight, "1000")
  const unit = await addCategory("ZQUNIT", "ZQPCS")
  await addUom("ZQLUSIN", unit, "12")
})

afterAll(async () => {
  await db.delete(uoms).where(like(uoms.code, "ZQ%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZQ%"))
  await db.$client.end()
})

beforeEach(() => loginAs(["administrator"]))

describe("convert_qty", () => {
  test("konversi dalam satu kategori, dibulatkan ke 4 desimal", async () => {
    expect(await convert("2.5", "ZQTON", "ZQG")).toBe("2500000.0000")
    expect(await convert("1", "ZQG", "ZQKG")).toBe("0.0010")
    expect(await convert("0.00004", "ZQG", "ZQKG")).toBe("0.0000")
    expect(await convert("5", "ZQPCS", "ZQLUSIN")).toBe("0.4167")
  })

  test("konversi antar kategori berbeda ditolak", async () => {
    expect(await pgErrorMessage(convert("1", "ZQKG", "ZQPCS"))).toContain(
      "Konversi antar kategori satuan yang berbeda tidak diizinkan.",
    )
  })
})

describe("aturan tabel satuan", () => {
  test("satu acuan per kategori, acuan berfaktor 1, faktor harus positif", async () => {
    const weight = ids.ZQBERAT
    for (const [values, constraint] of [
      [{ code: "ZQKG2", factor: "1", isReference: true }, "uoms_one_reference_per_category"],
      [{ code: "ZQREF", factor: "2", isReference: true }, "uoms_reference_factor_one"],
      [{ code: "ZQNOL", factor: "0", isReference: false }, "uoms_factor_positive"],
    ] as const) {
      await inRollback(db, async (tx) => {
        const message = await pgErrorMessage(
          tx.insert(uoms).values({ ...values, name: "X", categoryId: weight }),
        )
        expect(message).toContain(constraint)
      })
    }
  })

  test("kode, kategori, dan status acuan tidak bisa diubah", async () => {
    for (const [change, message] of [
      [{ code: "ZQGRAM" }, "Kode satuan tidak bisa diubah."],
      [{ categoryId: ids.ZQUNIT }, "Kategori satuan tidak bisa diubah."],
      [{ isReference: true, factor: "1" }, "Satuan acuan tidak bisa diganti."],
    ] as const) {
      await inRollback(db, async (tx) => {
        expect(
          await pgErrorMessage(tx.update(uoms).set(change).where(eq(uoms.id, ids.ZQG))),
        ).toContain(message)
      })
    }
  })
})

describe("aksi satuan", () => {
  test("kategori baru dibuat bersama satuan acuannya", async () => {
    const result = await createUomCategory(
      null,
      form({ code: "ZQVOL", name: "Volume Uji", referenceCode: "ZQL", referenceName: "Liter" }),
    )
    expect(result).toMatchObject({ ok: true })
    const [reference] = await db.select().from(uoms).where(eq(uoms.code, "ZQL"))
    expect(reference).toMatchObject({ isReference: true, factor: "1.0000000000" })
  })

  test("faktor boleh ditulis dengan koma; kode ganda ditolak", async () => {
    const created = await createUom(
      null,
      form({ categoryId: ids.ZQBERAT, code: "ZQONS", name: "Ons", factor: "0,1" }),
    )
    expect(created).toMatchObject({ ok: true })
    const [ons] = await db.select().from(uoms).where(eq(uoms.code, "ZQONS"))
    expect(ons.factor).toBe("0.1000000000")

    const duplicate = await createUom(
      null,
      form({ categoryId: ids.ZQUNIT, code: "ZQONS", name: "Lagi", factor: "1" }),
    )
    expect(duplicate).toMatchObject({ ok: false, errors: ["Kode satuan ZQONS sudah dipakai."] })
  })

  test("faktor tidak valid ditolak dengan pesan yang jelas", async () => {
    const result = await createUom(
      null,
      form({ categoryId: ids.ZQBERAT, code: "ZQX", name: "X", factor: "1.000,5" }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: ["Faktor harus angka lebih dari 0, maksimal 10 desimal."],
    })
  })

  test("faktor satuan acuan tidak bisa diubah; satuan lain bisa", async () => {
    const reference = await updateUom(
      null,
      form({ id: ids.ZQKG, name: "Kilogram", factor: "2", active: "on" }),
    )
    expect(reference).toMatchObject({ ok: false, errors: ["Faktor satuan acuan selalu 1."] })

    const updated = await updateUom(
      null,
      form({ id: ids.ZQTON, name: "Ton metrik", factor: "1000", active: "on" }),
    )
    expect(updated).toMatchObject({ ok: true })
  })

  test("peran selain Administrator tidak bisa mengubah satuan", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const result = await createUom(
        null,
        form({ categoryId: ids.ZQUNIT, code: "ZQNO", name: "X", factor: "2" }),
      )
      expect(result.ok).toBe(false)
    }
  })
})
