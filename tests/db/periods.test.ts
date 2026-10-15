import { and, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import { closePeriod } from "@/app/(app)/inventory/periode/actions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  partners,
  periodBalances,
  products,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { pgErrorMessage, purgeInventory, withLine } from "./helpers"

// Tutup periode bulanan (backlog M2-10). Data uji berawalan ZP dan memakai tahun 2019 supaya
// periode yang ditutup di sini tidak mengganggu tes lain yang bertanggal sekarang.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

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
  | "adjustment"
  | "transit"
  | "partner",
  string
>
let manajer: CurrentUser

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZPCAT", name: "Unit uji periode" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZPPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZPP1", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZPG1", "ZPG2"].map((code) => ({
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
      { code: "ZPRA", name: "Rak A", type: "internal" as const, warehouseId: one.id },
      { code: "ZPRB", name: "Rak B", type: "internal" as const, warehouseId: one.id },
      { code: "ZPRC", name: "Rak gudang 2", type: "internal" as const, warehouseId: two.id },
      { code: "ZPVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZPCUST", name: "Customer", type: "customer" as const },
      { code: "ZPADJ", name: "Penyesuaian", type: "adjustment" as const },
      { code: "ZPTRANS", name: "Transit", type: "transit" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.rackA, ids.rackB, ids.rackOther, ids.vendor, ids.customer, ids.adjustment, ids.transit] =
    rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZPV",
      name: "Mitra periode",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZPV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  const [user] = await db
    .insert(users)
    .values({ name: "Uji manajer periode", email: "zp-manajer@periode.test", emailVerified: true })
    .returning({ id: users.id })
  await db.insert(userRoles).values({ userId: user.id, role: "manajer" })
  manajer = {
    id: user.id,
    name: "Uji manajer periode",
    email: "zp-manajer@periode.test",
    roles: ["manajer"],
    twoFactorEnabled: true,
  }
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx.execute(sql`delete from period_balances where product_id = ${ids.product}`)
    await tx.execute(sql`delete from inventory_periods where year = 2019`)
  })
  await db.delete(users).where(eq(users.id, manajer.id))
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZP%"))
  await db.delete(warehouses).where(inArray(warehouses.id, [ids.one, ids.two]))
  await db.delete(products).where(eq(products.id, ids.product))
  await db.delete(uoms).where(like(uoms.code, "ZP%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZP%"))
  await db.$client.end()
})

type Kind = "receipt" | "delivery" | "internal" | "adjustment"

// Pergerakan Selesai bertanggal tertentu, langsung lewat validate_transfer (tanpa user = sistem,
// jadi backdate boleh).
async function move(type: Kind, from: string, to: string, qty: string, at: string) {
  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .insert(transfers)
      .values({
        type,
        sourceLocationId: from,
        destinationLocationId: to,
        partnerId: type === "receipt" || type === "delivery" ? ids.partner : null,
        reason: type === "adjustment" ? "Uji" : null,
        approvedAt: type === "adjustment" ? new Date() : null,
        approvedBy: type === "adjustment" ? manajer.id : null,
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
    return transfer.id
  })
}

async function balances(month: number) {
  return db
    .select({
      warehouseId: periodBalances.warehouseId,
      opening: periodBalances.openingQty,
      in: periodBalances.inQty,
      out: periodBalances.outQty,
      adjustment: periodBalances.adjustmentQty,
      closing: periodBalances.closingQty,
    })
    .from(periodBalances)
    .where(
      and(
        eq(periodBalances.year, 2019),
        eq(periodBalances.month, month),
        eq(periodBalances.productId, ids.product),
      ),
    )
}

describe("tutup periode", () => {
  test("berurutan; saldo akhir bulan N = saldo awal bulan N+1; pergerakan di periode tertutup ditolak", async () => {
    // Januari 2019: terima 100 di rak A, pindah 30 ke rak B (gudang sama, tidak dihitung),
    // kirim 20, penyesuaian −5.
    await move("receipt", ids.vendor, ids.rackA, "100", "2019-01-05T10:00:00+07:00")
    await move("internal", ids.rackA, ids.rackB, "30", "2019-01-10T10:00:00+07:00")
    await move("delivery", ids.rackA, ids.customer, "20", "2019-01-20T10:00:00+07:00")
    await move("adjustment", ids.rackB, ids.adjustment, "5", "2019-01-31T23:00:00+07:00")
    // Februari 2019: pindah 10 ke gudang 2 lewat transit (keluar dari gudang 1, masuk ke gudang 2).
    await move("internal", ids.rackA, ids.transit, "10", "2019-02-02T10:00:00+07:00")
    await move("internal", ids.transit, ids.rackOther, "10", "2019-02-02T10:00:00+07:00")

    session.user = manajer
    expect(await closePeriod({ year: 2019, month: 2 })).toMatchObject({
      ok: false,
      errors: ["Tutup dulu periode 01/2019."],
    })
    expect(await closePeriod({ year: 2019, month: 1 })).toMatchObject({ ok: true })
    expect(await balances(1)).toEqual([
      {
        warehouseId: ids.one,
        opening: "0.0000",
        in: "100.0000",
        out: "20.0000",
        adjustment: "-5.0000",
        closing: "75.0000",
      },
    ])

    expect(await closePeriod({ year: 2019, month: 2 })).toMatchObject({ ok: true })
    const february = await balances(2)
    expect(february).toEqual(
      expect.arrayContaining([
        {
          warehouseId: ids.one,
          opening: "75.0000",
          in: "0.0000",
          out: "10.0000",
          adjustment: "0.0000",
          closing: "65.0000",
        },
        {
          warehouseId: ids.two,
          opening: "0.0000",
          in: "10.0000",
          out: "0.0000",
          adjustment: "0.0000",
          closing: "10.0000",
        },
      ]),
    )

    // Periode tertutup terkunci.
    expect(
      await pgErrorMessage(
        move("receipt", ids.vendor, ids.rackA, "1", "2019-01-15T10:00:00+07:00"),
      ),
    ).toBe("Periode 01/2019 sudah ditutup. Pilih tanggal efektif di periode yang masih terbuka.")
    expect(await closePeriod({ year: 2019, month: 1 })).toMatchObject({
      ok: false,
      errors: ["Periode 01/2019 sudah ditutup."],
    })
    expect(
      await pgErrorMessage(db.execute(sql`delete from inventory_periods where year = 2019`)),
    ).toBe("Periode hanya bisa ditutup lewat close_period() dan tidak bisa diubah.")

    // Mengubah kategori produk tidak mengubah saldo periode yang sudah ditutup.
    await db.update(products).set({ category: "wip" }).where(eq(products.id, ids.product))
    expect((await balances(1))[0].closing).toBe("75.0000")
  })

  test("bulan tanpa pergerakan tidak bisa dilompati; backdate ke bulan itu ikut terkunci", async () => {
    // Melanjutkan tes sebelumnya: Januari dan Februari 2019 sudah ditutup.
    await move("receipt", ids.vendor, ids.rackA, "4", "2019-04-02T10:00:00+07:00")
    session.user = manajer
    expect(await closePeriod({ year: 2019, month: 4 })).toMatchObject({
      ok: false,
      errors: ["Tutup dulu periode 03/2019."],
    })
    expect(await closePeriod({ year: 2019, month: 3 })).toMatchObject({ ok: true })
    // Maret kosong, tapi saldo awal-akhirnya tetap tersimpan.
    expect((await balances(3)).find((row) => row.warehouseId === ids.one)).toMatchObject({
      opening: "65.0000",
      closing: "65.0000",
    })
    expect(await closePeriod({ year: 2019, month: 4 })).toMatchObject({ ok: true })
    expect(
      await pgErrorMessage(
        move("receipt", ids.vendor, ids.rackA, "1", "2019-03-20T10:00:00+07:00"),
      ),
    ).toBe("Periode 03/2019 sudah ditutup. Pilih tanggal efektif di periode yang masih terbuka.")
  })

  test("bulan berjalan belum bisa ditutup; hanya Manajer", async () => {
    const now = new Date()
    session.user = manajer
    expect(await closePeriod({ year: now.getFullYear() + 1, month: 1 })).toMatchObject({
      ok: false,
      errors: [expect.stringMatching(/belum berakhir\.$/)],
    })
    session.user = { ...manajer, roles: ["admin_gudang"] }
    expect(await closePeriod({ year: 2019, month: 3 })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
  })
})
