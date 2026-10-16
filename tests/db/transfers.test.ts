import { eq, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest"

import {
  approveTransfer,
  cancelTransfer,
  confirmTransfer,
  reopenTransfer,
  saveTransfer,
  validateTransfer,
} from "@/modules/inventory/actions/transfers"
import {
  cancelReturnRequest,
  closeReturnRequest,
  confirmReturnRequest,
  createReturnRequest,
  saveReturnRequest,
} from "@/modules/inventory/actions/returns"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  returnRequests,
  stockBalances,
  stockMoves,
  transferLines,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import {
  getTransfer,
  listTransfers,
  stockAvailability,
} from "@/modules/inventory/server/queries/transfers"

import { pgErrorMessage, purgeInventory } from "./helpers"

// Penerimaan dan pengiriman lewat server action (backlog M2-03, M2-04). Data uji berawalan ZT.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

const ids = {} as Record<
  | "pcs"
  | "dozen"
  | "product"
  | "lotProduct"
  | "vendor"
  | "rack"
  | "otherRack"
  | "sameRack"
  | "partner",
  string
>
const people = {} as Record<"admin" | "gudang" | "auditor" | "manajer", CurrentUser>

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
      {
        sku: "ZTLOT",
        name: "Cat",
        category: "raw_material",
        uomId: ids.pcs,
        tracking: "lot" as const,
      },
    ])
    .returning({ id: products.id })
  ;[ids.product, ids.lotProduct] = productRows.map((row) => row.id)
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZTG", name: "Gudang uji", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, rack] = await db
    .insert(locations)
    .values([
      { code: "ZTVENDOR", name: "Vendor", type: "vendor" as const },
      { code: "ZTRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
      { code: "ZTCUST", name: "Customer", type: "customer" as const },
      { code: "ZTSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZTADJ", name: "Penyesuaian", type: "adjustment" as const },
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
    })
    .returning({ id: warehouses.id })
  const [otherRack] = await db
    .insert(locations)
    .values({ code: "ZTRAK2", name: "Rak gudang 2", type: "internal", warehouseId: second.id })
    .returning({ id: locations.id })
  ids.otherRack = otherRack.id
  const [sameRack] = await db
    .insert(locations)
    .values({ code: "ZTRAK3", name: "Rak B", type: "internal", warehouseId: warehouse.id })
    .returning({ id: locations.id })
  ids.sameRack = sameRack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZTV",
      name: "PT Pemasok Uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZTV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id

  for (const [key, role] of [
    ["admin", "administrator"],
    ["gudang", "admin_gudang"],
    ["auditor", "auditor"],
    ["manajer", "manajer"],
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

    expect(await confirmTransfer({ id })).toMatchObject({ ok: true })
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
  // Lot penerimaan dicatat saat barang diterima (RU-03): Konfirmasi boleh, Validasi tetap ditolak.
  test("penerimaan produk wajib lot bisa dikonfirmasi, tapi tidak divalidasi tanpa nomor lot", async () => {
    loginAs("admin")
    const id = await savedId(
      await receipt([{ productId: ids.lotProduct, inputQty: "1", uomId: ids.pcs }]),
    )
    expect(await confirmTransfer({ id })).toMatchObject({ ok: true })
    expect(await validateTransfer({ id })).toEqual({
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
    await confirmTransfer({ id })
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
    await confirmTransfer({ id })
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
    await confirmTransfer({ id })
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
    // Konfirmasi menandai stok baru tersedia sebagian (R-06); validasi menolak dengan pesan per produk.
    expect(await confirmTransfer({ id })).toMatchObject({
      ok: true,
      data: { status: "partially_available" },
    })
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
    expect(await confirmTransfer({ id })).toMatchObject({ ok: true })
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
    await confirmTransfer({ id })
    const lines = (await getTransfer(people.admin.id, id))!.lines
    const result = await validateTransfer({
      id,
      quantities: { [lines[0].id]: "6", [lines[1].id]: "0" },
    })
    if (!result.ok) throw new Error(result.errors.join(" | "))
    const backorder = (result.data as { backorder: { id: string; number: string } }).backorder
    expect(backorder.number).toMatch(/^PNR\//)

    const original = await getTransfer(people.admin.id, id)
    // Qty diminta di baris asal tetap; qty selesai terpisah (R-05).
    expect([
      original!.status,
      original!.lines.map((line) => [line.sku, line.qty, line.doneQty]),
    ]).toEqual([
      "done",
      [
        ["ZTP1", "10.0000", "6.0000"],
        ["ZTLOT", "5.0000", "0.0000"],
      ],
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
    await confirmTransfer({ id })
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
    await confirmTransfer({ id })
    const [line] = (await getTransfer(people.admin.id, id))!.lines
    expect(await validateTransfer({ id, quantities: { [line.id]: "3,0" } })).toMatchObject({
      ok: true,
      data: { backorder: null },
    })
  })
})

describe("pindah lokasi", () => {
  function internal(lines: object[], values: Record<string, string> = {}) {
    return saveTransfer(
      null,
      form({
        type: "internal",
        locationId: ids.rack,
        otherLocationId: ids.sameRack,
        lines: JSON.stringify(lines),
        ...values,
      }),
    )
  }

  async function companyStock() {
    const [here, there] = await Promise.all([
      stockAvailability(ids.product, ids.rack),
      stockAvailability(ids.product, ids.sameRack),
    ])
    return [Number(here.qty), Number(there.qty)]
  }

  test("saldo pindah di dalam gudang; divalidasi langsung dari Draft", async () => {
    loginAs("admin")
    const receiptId = await savedId(
      await receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    await confirmTransfer({ id: receiptId })
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
    ]).toEqual(["TRF/", null, ids.sameRack])
    // Tanpa Konfirmasi terpisah (R-09).
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
    expect(await internal(line, { otherLocationId: ids.otherRack })).toMatchObject({
      ok: false,
      errors: [
        "Pindah lokasi hanya di dalam satu gudang. Pilih lokasi tujuan di gudang yang sama.",
      ],
    })
  })
})

describe("retur", () => {
  async function done(save: ReturnType<typeof receipt>) {
    const id = await savedId(await save)
    await confirmTransfer({ id })
    const result = await validateTransfer({ id })
    if (!result.ok) throw new Error(result.errors.join(" | "))
    return id
  }

  async function newRequest(originId: string) {
    const result = await createReturnRequest({ originId })
    if (!result.ok) throw new Error(result.errors.join(" | "))
    return result.data.id
  }

  async function request(id: string) {
    const [row] = (
      await db.execute<{ number: string; status: string; type: string; location_id: string }>(
        sql`select number, status, type, location_id from return_requests where id = ${id}`,
      )
    ).rows
    const lines = (
      await db.execute<{ id: string; qty: string; action: string }>(
        sql`select id, qty::text, action from return_request_lines
          where return_request_id = ${id} order by position`,
      )
    ).rows
    const linked = (
      await db.execute<{ id: string; type: string; status: string; movement_code: string }>(
        sql`select id, type, status, movement_code from transfers
          where return_request_id = ${id} order by created_at, number`,
      )
    ).rows
    return { ...row, lines, transfers: linked }
  }

  async function save(
    id: string,
    lines: Record<string, { qty: string; action: "return" | "replace" }>,
  ) {
    const current = await request(id)
    return saveReturnRequest({ id, locationId: current.location_id, lines })
  }

  test("retur ke vendor: transfer retur dari permintaan, qty tidak melebihi sisa setelah retur sebelumnya", async () => {
    loginAs("admin")
    const originId = await done(
      receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    const origin = await getTransfer(people.admin.id, originId)

    const firstId = await newRequest(originId)
    const first = await request(firstId)
    expect(first).toMatchObject({ status: "draft", type: "vendor", location_id: ids.rack })
    expect(first.lines.map((line) => [line.qty, line.action])).toEqual([["10.0000", "return"]])

    expect(
      await save(firstId, { [first.lines[0].id]: { qty: "4", action: "return" } }),
    ).toMatchObject({ ok: true })
    expect(await confirmReturnRequest({ id: firstId })).toMatchObject({ ok: true })
    const confirmed = await request(firstId)
    expect(confirmed.status).toBe("in_progress")
    expect(confirmed.transfers).toEqual([
      expect.objectContaining({ type: "return", status: "ready", movement_code: "gi_rtn" }),
    ])
    const returnTransfer = await getTransfer(people.admin.id, confirmed.transfers[0].id)
    expect(returnTransfer).toMatchObject({
      returnOfId: originId,
      returnOfNumber: origin!.number,
      partnerId: ids.partner,
      sourceLocationId: ids.rack,
      destinationLocationId: ids.vendor,
      reference: first.number,
    })
    // Konfirmasi retur ke vendor memesan stok: permintaan lain hanya bisa sisa 6.
    const secondId = await newRequest(originId)
    const second = await request(secondId)
    expect(second.lines.map((line) => line.qty)).toEqual(["6.0000"])
    expect(await save(secondId, { [second.lines[0].id]: { qty: "7", action: "return" } })).toEqual({
      ok: false,
      errors: ["Qty retur ZTP1 melebihi sisa yang bisa diretur: 6."],
    })

    expect(await validateTransfer({ id: confirmed.transfers[0].id })).toMatchObject({ ok: true })
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("6.0000")
    expect((await request(firstId)).status).toBe("done")

    const after = await getTransfer(people.admin.id, originId)
    expect(after!.returns.map((item) => item.number)).toEqual([first.number, second.number])
  })

  test("tutup tanpa pengganti: pengganti yang terbuka dibatalkan dan alasannya tercatat", async () => {
    loginAs("admin")
    const originId = await done(
      receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    const id = await newRequest(originId)
    const [line] = (await request(id)).lines
    await save(id, { [line.id]: { qty: "2", action: "replace" } })
    await confirmReturnRequest({ id })
    // Belum bisa ditutup selama transfer returnya belum Selesai.
    expect(await closeReturnRequest({ id, reason: "Vendor memberi nota kredit" })).toEqual({
      ok: false,
      errors: ["Transfer retur harus Selesai dulu sebelum permintaan ditutup tanpa pengganti."],
    })
    const returnId = (await request(id)).transfers[0].id
    await validateTransfer({ id: returnId })
    expect(await closeReturnRequest({ id, reason: " " })).toEqual({
      ok: false,
      errors: ["Alasan menutup tanpa pengganti wajib diisi."],
    })
    expect(await closeReturnRequest({ id, reason: "Vendor memberi nota kredit" })).toMatchObject({
      ok: true,
    })
    const closed = await request(id)
    expect(closed.status).toBe("done")
    expect(closed.transfers.map((row) => [row.type, row.status])).toEqual([
      ["return", "done"],
      ["receipt", "cancelled"],
    ])
    const [saved] = await db
      .select({ closeReason: returnRequests.closeReason })
      .from(returnRequests)
      .where(eq(returnRequests.id, id))
    expect(saved.closeReason).toBe("Vendor memberi nota kredit")
  })

  test("retur dengan pengganti: pengganti dibuat setelah retur Selesai sebesar qty yang diretur", async () => {
    loginAs("admin")
    const originId = await done(
      receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    const id = await newRequest(originId)
    const [line] = (await request(id)).lines
    await save(id, { [line.id]: { qty: "5", action: "replace" } })
    await confirmReturnRequest({ id })
    const returnId = (await request(id)).transfers[0].id
    // Hanya 3 yang benar-benar diretur; sisanya dibuang (tanpa transfer lanjutan).
    const returnTransfer = await getTransfer(people.admin.id, returnId)
    expect(
      await validateTransfer({
        id: returnId,
        quantities: { [returnTransfer!.lines[0].id]: "3" },
        createBackorder: false,
      }),
    ).toMatchObject({ ok: true })
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("7.0000")

    const afterReturn = await request(id)
    expect(afterReturn.status).toBe("in_progress")
    expect(afterReturn.transfers.map((row) => [row.type, row.status, row.movement_code])).toEqual([
      ["return", "done", "gi_rtn"],
      // Pengganti dari vendor memakai kode retur masuk, seperti hmx (I-02).
      ["receipt", "draft", "gr_rtn"],
    ])
    const replacement = await getTransfer(people.admin.id, afterReturn.transfers[1].id)
    expect(replacement).toMatchObject({
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
      returnRequestId: id,
    })
    expect(replacement!.lines.map((row) => row.qty)).toEqual(["3.0000"])

    // Pengganti tidak boleh melebihi yang diretur.
    await db
      .update(transferLines)
      .set({ inputQty: "4" })
      .where(eq(transferLines.transferId, replacement!.id))
    await db
      .update(stockMoves)
      .set({ inputQty: "4" })
      .where(eq(stockMoves.transferId, replacement!.id))
    expect(await confirmTransfer({ id: replacement!.id })).toEqual({
      ok: false,
      errors: ["Qty pengganti ZTP1 melebihi qty yang diretur dengan pengganti: 3."],
    })
    await db
      .update(transferLines)
      .set({ inputQty: "3" })
      .where(eq(transferLines.transferId, replacement!.id))
    await db
      .update(stockMoves)
      .set({ inputQty: "3" })
      .where(eq(stockMoves.transferId, replacement!.id))
    await confirmTransfer({ id: replacement!.id })
    expect(await validateTransfer({ id: replacement!.id })).toMatchObject({ ok: true })
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("10.0000")
    expect((await request(id)).status).toBe("done")
  })

  test("retur dari customer menambah stok kembali; semua sudah diretur tidak bisa dibuat lagi", async () => {
    loginAs("admin")
    await done(receipt([{ productId: ids.product, inputQty: "5", uomId: ids.pcs }]))
    const deliveryId = await done(
      delivery([{ productId: ids.product, inputQty: "5", uomId: ids.pcs }]),
    )
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("0.0000")

    const id = await newRequest(deliveryId)
    expect((await request(id)).type).toBe("customer")
    await confirmReturnRequest({ id })
    const [returnTransfer] = (await request(id)).transfers
    expect(returnTransfer).toMatchObject({ status: "ready", movement_code: "gr_rtn" })
    expect(await validateTransfer({ id: returnTransfer.id })).toMatchObject({ ok: true })
    expect((await stockAvailability(ids.product, ids.rack)).qty).toBe("5.0000")

    expect(await createReturnRequest({ originId: deliveryId })).toEqual({
      ok: false,
      errors: ["Semua barang transfer ini sudah diretur."],
    })
  })

  test("validasi menolak retur berlebih walau qty diubah langsung di database", async () => {
    loginAs("admin")
    const originId = await done(
      receipt([{ productId: ids.product, inputQty: "3", uomId: ids.pcs }]),
    )
    const id = await newRequest(originId)
    await confirmReturnRequest({ id })
    const [{ id: returnId }] = (await request(id)).transfers
    await db
      .update(transferLines)
      .set({ inputQty: "9" })
      .where(eq(transferLines.transferId, returnId))
    await db.update(stockMoves).set({ inputQty: "9" }).where(eq(stockMoves.transferId, returnId))
    const result = await validateTransfer({ id: returnId })
    expect(result).toMatchObject({ ok: false })
    expect(result.ok ? [] : result.errors).toEqual(
      expect.arrayContaining([
        "Qty retur ZTP1 melebihi sisa yang bisa diretur: 3.",
        expect.stringMatching(
          /^Qty retur ZTP1 melebihi sisa permintaan retur PRT\/\d{4}\/\d{5}: 3\.$/,
        ),
      ]),
    )
  })

  test("batal: transfer retur terbuka ikut batal; setelah barang diretur tidak bisa dibatalkan", async () => {
    loginAs("admin")
    const originId = await done(
      receipt([{ productId: ids.product, inputQty: "2", uomId: ids.pcs }]),
    )
    const id = await newRequest(originId)
    await confirmReturnRequest({ id })
    expect(await cancelReturnRequest({ id })).toMatchObject({ ok: true })
    const cancelled = await request(id)
    expect(cancelled.status).toBe("cancelled")
    expect(cancelled.transfers.map((row) => row.status)).toEqual(["cancelled"])

    const secondId = await newRequest(originId)
    await confirmReturnRequest({ id: secondId })
    await validateTransfer({ id: (await request(secondId)).transfers[0].id })
    expect(await cancelReturnRequest({ id: secondId })).toEqual({
      ok: false,
      errors: ["Permintaan retur yang barangnya sudah diretur tidak bisa dibatalkan."],
    })
  })

  test("retur hanya dari penerimaan/pengiriman Selesai dan selalu lewat permintaan", async () => {
    loginAs("admin")
    const draftId = await savedId(
      await receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
    )
    expect(await createReturnRequest({ originId: draftId })).toEqual({
      ok: false,
      errors: ["Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai."],
    })
    const doneId = await done(receipt([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]))
    expect(
      await pgErrorMessage(
        db.execute(sql`
          insert into transfers (type, source_location_id, destination_location_id, partner_id,
            return_of_id)
          values ('return', ${ids.rack}, ${ids.vendor}, ${ids.partner}, ${doneId})`),
      ),
    ).toBe("Retur dibuat lewat permintaan retur.")
  })
})

describe("scrap dan penyesuaian", () => {
  function adjustment(lines: object[], values: Record<string, string> = {}) {
    return saveTransfer(
      null,
      form({
        type: "adjustment",
        locationId: ids.rack,
        direction: "decrease",
        reason: "Rusak saat bongkar muat",
        lines: JSON.stringify(lines),
        ...values,
      }),
    )
  }

  async function stockOnRack(productId = ids.product) {
    return (await stockAvailability(productId, ids.rack)).qty
  }

  // Saldo fisik di rak (tanpa dikurangi pesanan).
  async function onHandOnRack(productId = ids.product) {
    const result = await db.execute<{ qty: string }>(
      sql`select coalesce(sum(qty), 0)::numeric(18,4)::text as qty from stock_balances
          where product_id = ${productId} and location_id = ${ids.rack}`,
    )
    return result.rows[0].qty
  }

  async function receiveTen() {
    const id = await savedId(
      await receipt([{ productId: ids.product, inputQty: "10", uomId: ids.pcs }]),
    )
    await confirmTransfer({ id })
    await validateTransfer({ id })
  }

  test("alasan dan arah penyesuaian wajib", async () => {
    loginAs("admin")
    const line = [{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]
    expect(await adjustment(line, { reason: "", direction: "" })).toMatchObject({ ok: false })
    const result = await adjustment(line, { reason: "" })
    expect(result).toMatchObject({ ok: false, errors: ["Alasan wajib diisi."] })
  })

  test("pergerakan baru tercatat setelah Manajer menyetujui", async () => {
    loginAs("admin")
    await receiveTen()
    const id = await savedId(
      await adjustment([{ productId: ids.product, inputQty: "2", uomId: ids.pcs }]),
    )
    await confirmTransfer({ id })

    // Tanpa persetujuan: validasi biasa ditolak, stok tidak berubah.
    expect(await validateTransfer({ id })).toEqual({
      ok: false,
      errors: ["Belum disetujui Manajer."],
    })
    loginAs("gudang")
    expect(await approveTransfer({ id })).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    // Stok fisik belum berubah; 2 sudah dipesan penyesuaian ini (R-07), jadi tersedia 8.
    expect(await onHandOnRack()).toBe("10.0000")
    expect(await stockOnRack()).toBe("8.0000")

    loginAs("manajer")
    expect(await approveTransfer({ id })).toMatchObject({ ok: true })
    expect(await stockOnRack()).toBe("8.0000")
    const transfer = await getTransfer(people.manajer.id, id)
    expect(transfer).toMatchObject({
      status: "done",
      reason: "Rusak saat bongkar muat",
      approvedBy: people.manajer.id,
      approvedByName: "Uji manajer",
      sourceLocationId: ids.rack,
    })
  })

  test("penyesuaian tambah stok boleh membawa lot baru", async () => {
    loginAs("admin")
    const id = await savedId(
      await adjustment(
        [{ productId: ids.lotProduct, inputQty: "3", uomId: ids.pcs, lotName: "TEMU-1" }],
        { direction: "increase", reason: "Ditemukan saat opname" },
      ),
    )
    const saved = await getTransfer(people.admin.id, id)
    expect(saved!.destinationLocationId).toBe(ids.rack)
    await confirmTransfer({ id })
    loginAs("manajer")
    expect(await approveTransfer({ id })).toMatchObject({ ok: true })
    expect(await stockOnRack(ids.lotProduct)).toBe("3.0000")
  })

  test("scrap memindah stok ke lokasi scrap; gagal validasi membatalkan persetujuan", async () => {
    loginAs("admin")
    await receiveTen()
    const scrap = (qty: string, usageType = "scrap") =>
      saveTransfer(
        null,
        form({
          type: "scrap",
          locationId: ids.rack,
          reason: "Reject QC",
          usageType,
          lines: JSON.stringify([{ productId: ids.product, inputQty: qty, uomId: ids.pcs }]),
        }),
      )
    const tooMuch = await savedId(await scrap("12"))
    expect(await confirmTransfer({ id: tooMuch })).toMatchObject({
      data: { status: "partially_available" },
    })
    loginAs("manajer")
    expect(await approveTransfer({ id: tooMuch })).toEqual({
      ok: false,
      errors: ["Stok ZTP1 di ZTRAK tidak cukup: tersedia 10, dibutuhkan 12."],
    })
    expect((await getTransfer(people.manajer.id, tooMuch))!.approvedAt).toBeNull()
    // Transfer yang ditolak masih memesan stok; dibatalkan dulu supaya stoknya tersedia lagi.
    expect(await cancelTransfer({ id: tooMuch })).toMatchObject({ ok: true })

    loginAs("admin")
    const id = await savedId(await scrap("4"))
    await confirmTransfer({ id })
    loginAs("manajer")
    expect(await approveTransfer({ id })).toMatchObject({ ok: true })
    expect(await stockOnRack()).toBe("6.0000")
    expect((await getTransfer(people.manajer.id, id))!.number).toMatch(/^SCR\//)
  })

  test("jenis pemakaian wajib dan tersimpan; susut transit tidak bisa dipilih di form", async () => {
    loginAs("admin")
    const save = (usageType?: string) =>
      saveTransfer(
        null,
        form({
          type: "scrap",
          locationId: ids.rack,
          reason: "Dipakai produksi",
          ...(usageType ? { usageType } : {}),
          lines: JSON.stringify([{ productId: ids.product, inputQty: "1", uomId: ids.pcs }]),
        }),
      )
    expect(await save()).toMatchObject({ ok: false, errors: ["Pilih jenis pemakaian."] })
    expect(await save("transit_loss")).toMatchObject({ ok: false })
    const id = await savedId(await save("usage"))
    const saved = await getTransfer(people.admin.id, id)
    expect([saved!.usageType, saved!.movementCode]).toEqual(["usage", "pu"])
    const rows = await listTransfers({
      userId: people.admin.id,
      type: "scrap",
      usageType: "usage",
      search: "",
      page: 1,
      pageSize: 50,
      offset: 0,
    })
    expect(rows.rows.map((row) => row.id)).toContain(id)
  })
})
