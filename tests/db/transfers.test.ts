import { eq, like } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import {
  cancelTransfer,
  markTransferReady,
  reopenTransfer,
  saveTransfer,
  validateTransfer,
} from "@/app/(app)/inventory/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockBalances,
  stockMoves,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { getTransfer, listTransfers, stockAvailability } from "@/server/queries/transfers"

import { purgeInventory } from "./helpers"

// Penerimaan dan pengiriman lewat server action (backlog M2-03, M2-04). Data uji berawalan ZT.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

const ids = {} as Record<
  "pcs" | "dozen" | "product" | "lotProduct" | "vendor" | "rack" | "otherRack" | "partner",
  string
>
const people = {} as Record<"admin" | "gudang" | "auditor", CurrentUser>

function loginAs(person: keyof typeof people) {
  session.user = people[person]
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

function receipt(lines: object[], values: Record<string, string> = {}) {
  return saveTransfer(
    null,
    form({
      type: "receipt",
      partnerId: ids.partner,
      locationId: ids.rack,
      reference: "PO-001",
      lines: JSON.stringify(lines),
      ...values,
    }),
  )
}

function delivery(lines: object[], values: Record<string, string> = {}) {
  return saveTransfer(
    null,
    form({
      type: "delivery",
      partnerId: ids.partner,
      locationId: ids.rack,
      lines: JSON.stringify(lines),
      ...values,
    }),
  )
}

async function savedId(result: Awaited<ReturnType<typeof receipt>>) {
  if (!result.ok) throw new Error(result.errors.join(" | "))
  return result.data.id
}

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZTCAT", name: "Unit uji penerimaan" })
    .returning({ id: uomCategories.id })
  const units = await db
    .insert(uoms)
    .values([
      { code: "ZTPCS", name: "Buah", categoryId: category.id, factor: "1", isReference: true },
      { code: "ZTLSN", name: "Lusin", categoryId: category.id, factor: "12" },
    ])
    .returning({ id: uoms.id })
  ;[ids.pcs, ids.dozen] = units.map((row) => row.id)
  const productRows = await db
    .insert(products)
    .values([
      { sku: "ZTP1", name: "Baut", category: "raw_material", uomId: ids.pcs },
      { sku: "ZTLOT", name: "Cat", category: "raw_material", uomId: ids.pcs, lotRequired: true },
    ])
    .returning({ id: products.id })
  ;[ids.product, ids.lotProduct] = productRows.map((row) => row.id)
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZTG", name: "Gudang uji", address: "Bekasi", isBonded: true, category: "wip" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZTVENDOR", name: "Vendor", type: "vendor" as const },
      { code: "ZTRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZTCUST", name: "Customer", type: "customer" as const },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.rack = rack.id
  const [second] = await db
    .insert(warehouses)
    .values({
      code: "ZTG2",
      name: "Gudang uji 2",
      address: "Bekasi",
      isBonded: false,
      category: "wip",
    })
    .returning({ id: warehouses.id })
  const [otherRack] = await db
    .insert(locations)
    .values({ code: "ZTRAK2", name: "Rak gudang 2", type: "internal", warehouseId: second.id })
    .returning({ id: locations.id })
  ids.otherRack = otherRack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZTV",
      name: "PT Pemasok Uji",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZTV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id

  for (const [key, role] of [
    ["admin", "administrator"],
    ["gudang", "admin_gudang"],
    ["auditor", "auditor"],
  ] as [keyof typeof people, Role][]) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zt-${role}@penerimaan.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    people[key] = {
      id: user.id,
      name: `Uji ${role}`,
      email: `zt-${role}@penerimaan.test`,
      roles: [role],
      twoFactorEnabled: true,
    }
  }
})

afterEach(async () => {
  await purgeInventory(db, [ids.product, ids.lotProduct])
})

afterAll(async () => {
  await db.delete(users).where(like(users.email, "zt-%@penerimaan.test"))
  await db.delete(partners).where(eq(partners.code, "ZTV"))
  await db.delete(locations).where(like(locations.code, "ZT%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZT%"))
  await db.delete(products).where(like(products.sku, "ZT%"))
  await db.delete(uoms).where(like(uoms.code, "ZT%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZT%"))
  await db.$client.end()
})

describe("simpan penerimaan", () => {
  test("Draft dengan baris, konversi satuan, dan lot yang dibuat otomatis", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([
        { productId: ids.product, inputQty: "2", uomId: ids.dozen },
        { productId: ids.lotProduct, inputQty: "1,5", uomId: ids.pcs, lotName: " B-07 " },
      ]),
    )
    const transfer = await getTransfer(people.admin.id, id)
    expect(transfer).toMatchObject({
      type: "receipt",
      status: "draft",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      reference: "PO-001",
      createdBy: people.admin.id,
    })
    expect(transfer!.number).toMatch(/^PNR\//)
    expect(
      transfer!.lines.map((line) => [line.sku, line.inputQty, line.qty, line.lotName]),
    ).toEqual([
      ["ZTP1", "2.0000", "24.0000", null],
      ["ZTLOT", "1.5000", "1.5000", "B-07"],
    ])
  })

  test("semua kesalahan form dan baris dilaporkan sekaligus dengan nomor barisnya", async () => {
    loginAs("admin")
    const result = await receipt(
      [
        { productId: ids.product, inputQty: "0", uomId: ids.pcs },
        { productId: "", inputQty: "3", uomId: "" },
      ],
      { partnerId: "" },
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [
        "Baris 1: qty harus angka lebih dari 0, maksimal 4 desimal.",
        "Baris 2: pilih produk.",
        "Baris 2: pilih satuan.",
      ],
    })
    expect(await receipt([], { partnerId: "" })).toMatchObject({
      ok: false,
      errors: ["Tambahkan minimal satu baris barang."],
    })
  })

  test("vendor wajib; user tanpa akses gudang ditolak; auditor tidak boleh menyimpan", async () => {
    loginAs("admin")
    expect(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }], { partnerId: "" }),
    ).toMatchObject({ ok: false, errors: ["Pilih vendor."] })

    loginAs("gudang")
    expect(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    ).toMatchObject({ ok: false, errors: ["Anda tidak punya akses ke gudang lokasi ini."] })

    loginAs("auditor")
    expect(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    ).toMatchObject({ ok: false, errors: ["Anda tidak punya izin untuk melakukan aksi ini."] })
  })

  test("mengubah Draft mengganti barisnya; transfer Siap tidak bisa diubah", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    )
    await savedId(
      await receipt([{ productId: ids.product, inputQty: "7", uomId: ids.pcs }], {
        id,
        reference: "PO-002",
      }),
    )
    const transfer = await getTransfer(people.admin.id, id)
    expect([transfer!.reference, transfer!.lines.map((line) => line.qty)]).toEqual([
      "PO-002",
      ["7.0000"],
    ])

    expect(await markTransferReady({ id })).toMatchObject({ ok: true })
    expect(
      await receipt([{ productId: ids.product, inputQty: "9", uomId: ids.pcs }], { id }),
    ).toMatchObject({
      ok: false,
      errors: ["Hanya transfer Draft yang bisa diubah. Kembalikan ke Draft dulu."],
    })
    expect(await reopenTransfer({ id })).toMatchObject({ ok: true })
  })
})

describe("alur status", () => {
  test("produk wajib lot tidak bisa ditandai Siap tanpa nomor lot", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.lotProduct, inputQty: "1", uomId: ids.pcs }]),
    )
    expect(await markTransferReady({ id })).toEqual({
      ok: false,
      errors: ["Produk ZTLOT wajib diisi nomor lot."],
    })
  })

  test("penerimaan Selesai menambah saldo di lokasi tujuan", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([
        { productId: ids.product, inputQty: "2", uomId: ids.dozen },
        { productId: ids.product, inputQty: "6", uomId: ids.pcs },
      ]),
    )
    await markTransferReady({ id })
    expect(await validateTransfer({ id })).toMatchObject({ ok: true })

    const [balance] = await db
      .select({ qty: stockBalances.qty })
      .from(stockBalances)
      .where(eq(stockBalances.locationId, ids.rack))
    expect(balance.qty).toBe("30.0000")
    const transfer = await getTransfer(people.admin.id, id)
    expect([transfer!.status, transfer!.doneBy]).toEqual(["done", people.admin.id])

    // Setelah Selesai: tidak bisa dibatalkan atau divalidasi ulang.
    expect(await cancelTransfer({ id })).toMatchObject({ ok: false })
    expect(await validateTransfer({ id })).toEqual({
      ok: false,
      errors: [`Transfer ${transfer!.number} sudah Selesai.`],
    })
  })

  test("backdate oleh Administrator (bukan Manajer) ditolak", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    )
    await markTransferReady({ id })
    expect(await validateTransfer({ id, effectiveDate: "2020-01-02" })).toEqual({
      ok: false,
      errors: ["Tanggal efektif mundur (backdate) hanya boleh dilakukan Manajer."],
    })
  })

  test("batal dari Draft ikut membatalkan barisnya", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    )
    expect(await cancelTransfer({ id })).toMatchObject({ ok: true })
    const moves = await db.select().from(stockMoves).where(eq(stockMoves.transferId, id))
    expect(moves.map((move) => move.status)).toEqual(["cancelled"])
  })
})

test("daftar penerimaan hanya berisi gudang yang boleh dilihat user", async () => {
  loginAs("admin")
  await savedId(await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]))
  const page = { search: "PT Pemasok Uji", page: 1, pageSize: 20, offset: 0 }
  const forAdmin = await listTransfers({ ...page, userId: people.admin.id, type: "receipt" })
  const forGudang = await listTransfers({ ...page, userId: people.gudang.id, type: "receipt" })
  expect([forAdmin.total, forGudang.total]).toEqual([1, 0])
  expect(forAdmin.rows[0]).toMatchObject({ partnerName: "PT Pemasok Uji", lineCount: 1 })
})

describe("pengiriman", () => {
  async function receive(lines: object[]) {
    const id = await savedId(await receipt(lines))
    await markTransferReady({ id })
    const result = await validateTransfer({ id })
    if (!result.ok) throw new Error(result.errors.join(" | "))
  }

  test("pengiriman melebihi stok gudang berikat ditolak dengan pesan per produk", async () => {
    loginAs("admin")
    await receive([
      { productId: ids.product, inputQty: "5", uomId: ids.pcs },
      { productId: ids.lotProduct, inputQty: "2", uomId: ids.pcs, lotName: "B-07" },
    ])
    const id = await savedId(
      await delivery([
        { productId: ids.product, inputQty: "1", uomId: ids.dozen },
        { productId: ids.lotProduct, inputQty: "3", uomId: ids.pcs, lotName: "B-07" },
      ]),
    )
    const expected = [
      "Stok ZTLOT lot B-07 di ZTRAK tidak cukup: tersedia 2, dibutuhkan 3.",
      "Stok ZTP1 di ZTRAK tidak cukup: tersedia 5, dibutuhkan 12.",
    ]
    // Dicek saat Siap dan sekali lagi saat validasi.
    expect(await markTransferReady({ id })).toEqual({ ok: false, errors: expected })
    expect(await validateTransfer({ id })).toEqual({ ok: false, errors: expected })
  })

  test("pengiriman mengurangi stok lot yang dipilih", async () => {
    loginAs("admin")
    await receive([{ productId: ids.lotProduct, inputQty: "10", uomId: ids.pcs, lotName: "B-07" }])
    expect(await stockAvailability(ids.lotProduct, ids.rack)).toEqual({
      qty: "10.0000",
      uomCode: "ZTPCS",
      lots: [{ name: "B-07", qty: "10.0000" }],
    })

    const id = await savedId(
      await delivery([
        { productId: ids.lotProduct, inputQty: "4", uomId: ids.pcs, lotName: "B-07" },
      ]),
    )
    expect(await markTransferReady({ id })).toMatchObject({ ok: true })
    expect(await validateTransfer({ id })).toMatchObject({ ok: true })
    expect((await stockAvailability(ids.lotProduct, ids.rack)).qty).toBe("6.0000")
    const transfer = await getTransfer(people.admin.id, id)
    expect([transfer!.number.slice(0, 4), transfer!.sourceLocationId]).toEqual(["PGR/", ids.rack])
  })

  test("lot barang keluar harus lot yang sudah ada", async () => {
    loginAs("admin")
    expect(
      await delivery([
        { productId: ids.lotProduct, inputQty: "1", uomId: ids.pcs, lotName: "X-99" },
      ]),
    ).toMatchObject({
      ok: false,
      errors: ["Baris 1: lot X-99 tidak ada untuk produk ini."],
    })
  })
})

describe("penerimaan parsial dan backorder", () => {
  test("qty selesai lebih kecil: sisanya jadi transfer lanjutan Draft, stok hanya bertambah yang selesai", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([
        { productId: ids.product, inputQty: "10", uomId: ids.pcs },
        { productId: ids.lotProduct, inputQty: "5", uomId: ids.pcs, lotName: "B-07" },
      ]),
    )
    await markTransferReady({ id })
    const lines = (await getTransfer(people.admin.id, id))!.lines
    const result = await validateTransfer({
      id,
      quantities: { [lines[0].id]: "6", [lines[1].id]: "0" },
    })
    if (!result.ok) throw new Error(result.errors.join(" | "))
    const backorder = (result.data as { backorder: { id: string; number: string } }).backorder
    expect(backorder.number).toMatch(/^PNR\//)

    const original = await getTransfer(people.admin.id, id)
    expect([original!.status, original!.lines.map((line) => [line.sku, line.qty])]).toEqual([
      "done",
      [["ZTP1", "6.0000"]],
    ])
    const rest = await getTransfer(people.admin.id, backorder.id)
    expect(rest).toMatchObject({
      status: "draft",
      backorderOfId: id,
      backorderOfNumber: original!.number,
      reference: "PO-001",
    })
    expect(rest!.lines.map((line) => [line.sku, line.qty, line.lotName])).toEqual([
      ["ZTP1", "4.0000", null],
      ["ZTLOT", "5.0000", "B-07"],
    ])
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("6.0000")
    expect((await stockAvailability(ids.lotProduct, ids.rack)).qty).toBe("0.0000")
  })

  test("qty selesai di luar 0..rencana atau semuanya 0 ditolak tanpa perubahan", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    await markTransferReady({ id })
    const [line] = (await getTransfer(people.admin.id, id))!.lines
    expect(await validateTransfer({ id, quantities: { [line.id]: "11" } })).toEqual({
      ok: false,
      errors: ["Qty ZTP1 harus antara 0 dan 10."],
    })
    expect(await validateTransfer({ id, quantities: { [line.id]: "0" } })).toEqual({
      ok: false,
      errors: ["Isi qty minimal satu baris. Untuk membatalkan semuanya, batalkan transfer."],
    })
    const transfer = await getTransfer(people.admin.id, id)
    expect([transfer!.status, transfer!.lines.map((row) => row.qty)]).toEqual([
      "ready",
      ["10.0000"],
    ])
  })

  test("qty selesai sama dengan rencana: tanpa transfer lanjutan", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "3", uomId: ids.pcs }]),
    )
    await markTransferReady({ id })
    const [line] = (await getTransfer(people.admin.id, id))!.lines
    expect(await validateTransfer({ id, quantities: { [line.id]: "3,0" } })).toMatchObject({
      ok: true,
      data: { backorder: null },
    })
  })
})

describe("transfer internal", () => {
  function internal(lines: object[], values: Record<string, string> = {}) {
    return saveTransfer(
      null,
      form({
        type: "internal",
        locationId: ids.rack,
        otherLocationId: ids.otherRack,
        lines: JSON.stringify(lines),
        ...values,
      }),
    )
  }

  async function companyStock() {
    const [here, there] = await Promise.all([
      stockAvailability(ids.product, ids.rack),
      stockAvailability(ids.product, ids.otherRack),
    ])
    return [Number(here.qty), Number(there.qty)]
  }

  test("saldo pindah antar gudang tanpa mengubah total stok perusahaan", async () => {
    loginAs("admin")
    const receiptId = await savedId(
      await receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    await markTransferReady({ id: receiptId })
    await validateTransfer({ id: receiptId })
    expect(await companyStock()).toEqual([10, 0])

    const id = await savedId(
      await internal([{ productId: ids.product, inputQty: "4", uomId: ids.pcs }]),
    )
    const transfer = await getTransfer(people.admin.id, id)
    expect([
      transfer!.number.slice(0, 4),
      transfer!.partnerId,
      transfer!.destinationLocationId,
    ]).toEqual(["TRF/", null, ids.otherRack])
    expect(await markTransferReady({ id })).toMatchObject({ ok: true })
    expect(await validateTransfer({ id })).toMatchObject({ ok: true })

    const [here, there] = await companyStock()
    expect([here, there, here + there]).toEqual([6, 4, 10])
  })

  test("lokasi tujuan wajib dan harus berbeda dari lokasi asal", async () => {
    loginAs("admin")
    const line = [{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]
    expect(await internal(line, { otherLocationId: "" })).toMatchObject({
      ok: false,
      errors: ["Pilih lokasi tujuan."],
    })
    expect(await internal(line, { otherLocationId: ids.rack })).toMatchObject({
      ok: false,
      errors: ["Lokasi asal dan tujuan harus berbeda."],
    })
  })
})
