import { eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { MOVEMENT_CODE_DIRECTIONS, type MovementCode } from "@/lib/inventory"
import { db } from "@/server/db"
import {
  interwarehouseTransferLines,
  interwarehouseTransfers,
  locations,
  lots,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  userRoles,
  users,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { getLotTrace } from "@/server/queries/lots"
import { listStock, stockCard } from "@/server/queries/stock"

import { purgeInventory, returnRequestFor, withLine } from "./helpers"

// Kartu stok dan penelusuran lot (backlog R-14): setiap kode pergerakan dibuat di hari berbeda
// (Mei 2021) untuk satu lot, lalu saldo berjalan kartu stok dibandingkan dengan saldo per tanggal.
// Data uji berawalan ZK.

const ids = {} as Record<
  | "pcs"
  | "product"
  | "lot"
  | "one"
  | "two"
  | "rackA"
  | "rackB"
  | "rackOther"
  | "vendor"
  | "customer"
  | "transit"
  | "scrap"
  | "adjustment"
  | "partner"
  | "admin"
  | "gudang",
  string
>

type Kind = "receipt" | "delivery" | "internal" | "return" | "scrap" | "adjustment"

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZKCAT", name: "Unit uji kartu stok" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZKPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({
      sku: "ZKP1",
      name: "Modul",
      category: "raw_material",
      uomId: pcs.id,
      tracking: "lot",
    })
    .returning({ id: products.id })
  ids.product = product.id
  const [lot] = await db
    .insert(lots)
    .values({ productId: product.id, name: "ZK-LOT-1" })
    .returning({ id: lots.id })
  ids.lot = lot.id
  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZKG1", "ZKG2"].map((code) => ({
        code,
        name: code,
        address: "Bekasi",
      })),
    )
    .returning({ id: warehouses.id })
  ids.one = one.id
  ids.two = two.id
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZKRA", name: "Rak A", type: "internal" as const, warehouseId: one.id },
      { code: "ZKRB", name: "Rak B", type: "internal" as const, warehouseId: one.id },
      { code: "ZKRC", name: "Rak gudang 2", type: "internal" as const, warehouseId: two.id },
      { code: "ZKVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZKCUST", name: "Customer", type: "customer" as const },
      { code: "ZKTRANS", name: "Transit", type: "transit" as const },
      { code: "ZKSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZKADJ", name: "Penyesuaian", type: "adjustment" as const },
    ])
    .returning({ id: locations.id })
  ;[
    ids.rackA,
    ids.rackB,
    ids.rackOther,
    ids.vendor,
    ids.customer,
    ids.transit,
    ids.scrap,
    ids.adjustment,
  ] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZKV",
      name: "Mitra kartu stok",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZKV",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  for (const [key, role] of [
    ["admin", "administrator"],
    ["gudang", "admin_gudang"],
  ] as const) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zk-${role}@kartu.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    ids[key] = user.id
  }
  await buildLedger()
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`)
    const requests = tx
      .select({ id: interwarehouseTransfers.id })
      .from(interwarehouseTransfers)
      .where(eq(interwarehouseTransfers.sourceLocationId, ids.rackA))
    await tx
      .delete(interwarehouseTransferLines)
      .where(inArray(interwarehouseTransferLines.interwarehouseId, requests))
    await tx
      .delete(interwarehouseTransfers)
      .where(eq(interwarehouseTransfers.sourceLocationId, ids.rackA))
  })
  await db.delete(users).where(like(users.email, "zk-%@kartu.test"))
  await db.delete(partners).where(eq(partners.id, ids.partner))
  await db.delete(locations).where(like(locations.code, "ZK%"))
  await db.delete(warehouses).where(inArray(warehouses.id, [ids.one, ids.two]))
  await db.delete(products).where(eq(products.id, ids.product))
  await db.delete(uoms).where(like(uoms.code, "ZK%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZK%"))
  await db.$client.end()
})

const at = (day: number) => `2021-05-${String(day).padStart(2, "0")}T10:00:00+07:00`

// Transfer satu baris lot ZK-LOT-1, langsung divalidasi pada tanggal tertentu (tanpa user =
// sistem, jadi backdate boleh). Scrap dan penyesuaian sudah disetujui Administrator.
async function move(
  type: Kind,
  from: string,
  to: string,
  qty: string,
  day: number,
  originId?: string,
) {
  return db.transaction(async (tx) => {
    const approved = type === "scrap" || type === "adjustment"
    const [transfer] = await tx
      .insert(transfers)
      .values({
        type,
        sourceLocationId: from,
        destinationLocationId: to,
        partnerId: ["receipt", "delivery", "return"].includes(type) ? ids.partner : null,
        returnOfId: originId ?? null,
        returnRequestId: originId ? await returnRequestWithLine(tx, originId, qty) : null,
        reason: approved ? "Uji kartu stok" : null,
        approvedAt: approved ? new Date() : null,
        approvedBy: approved ? ids.admin : null,
      })
      .returning({ id: transfers.id })
    await tx.insert(stockMoves).values(
      await withLine(tx, {
        transferId: transfer.id,
        productId: ids.product,
        lotId: ids.lot,
        inputQty: qty,
        inputUomId: ids.pcs,
        sourceLocationId: from,
        destinationLocationId: to,
      }),
    )
    await tx.execute(sql`select validate_transfer(${transfer.id}, ${at(day)}::timestamptz)`)
    return transfer.id
  })
}

// Permintaan retur dengan satu baris lot ZK-LOT-1 (transfer retur tidak boleh melebihinya).
async function returnRequestWithLine(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  originId: string,
  qty: string,
) {
  const requestId = await returnRequestFor(tx, originId)
  await tx.execute(sql`
    insert into return_request_lines (return_request_id, position, product_id, lot_id, qty)
    values (${requestId}, 1, ${ids.product}, ${ids.lot}, ${qty})`)
  return requestId
}

// Transfer milik permintaan antar gudang yang dibuat database: validasi qty tertentu, sisanya
// dibuang.
async function validateLinked(code: MovementCode, qty: string, day: number) {
  await db.transaction(async (tx) => {
    const [row] = (
      await tx.execute<{ id: string; line_id: string }>(sql`
        select t.id, l.id as line_id from transfers t
        join transfer_lines l on l.transfer_id = t.id
        join interwarehouse_transfers i on i.id = t.interwarehouse_id
        where i.source_location_id = ${ids.rackA} and t.movement_code = ${code}
          and t.status::text not in ('done', 'cancelled')`)
    ).rows
    await tx.execute(
      sql`select split_backorder(${row.id}, ${JSON.stringify({ [row.line_id]: qty })}::jsonb, false)`,
    )
    await tx.execute(sql`select validate_transfer(${row.id}, ${at(day)}::timestamptz)`)
  })
}

async function buildLedger() {
  const receipt = await move("receipt", ids.vendor, ids.rackA, "20", 1) // gr
  await move("internal", ids.rackA, ids.rackB, "5", 2) // ilt
  const delivery = await move("delivery", ids.rackA, ids.customer, "3", 3) // gi
  await move("return", ids.customer, ids.rackA, "1", 4, delivery) // gr_rtn
  await move("return", ids.rackA, ids.vendor, "2", 5, receipt) // gi_rtn

  // Antar gudang: keluar 4 ke transit, masuk 3 ke gudang 2, sisa 1 kembali ke gudang 1.
  const [request] = await db
    .insert(interwarehouseTransfers)
    .values({
      sourceLocationId: ids.rackA,
      destinationLocationId: ids.rackOther,
      transitLocationId: ids.transit,
    })
    .returning({ id: interwarehouseTransfers.id })
  await db.insert(interwarehouseTransferLines).values({
    interwarehouseId: request.id,
    productId: ids.product,
    lotId: ids.lot,
    inputQty: "4",
    inputUomId: ids.pcs,
  })
  await db.execute(sql`select confirm_interwarehouse(${request.id})`)
  await validateLinked("itw_out", "4", 6)
  await validateLinked("itw_in", "3", 7)
  await db.execute(sql`select settle_interwarehouse(${request.id}, 'return')`)
  await validateLinked("itw_rtn", "1", 8)

  await move("scrap", ids.rackB, ids.scrap, "1", 9) // pu
  await move("adjustment", ids.adjustment, ids.rackB, "2", 10) // adj_in
  await move("adjustment", ids.rackB, ids.adjustment, "1", 11) // adj_out
}

// Saldo satu gudang per akhir hari (dari ledger), lewat tampilan stok.
async function balanceOn(warehouseId: string, day: number) {
  const { rows } = await listStock({
    search: "ZKP1",
    page: 1,
    pageSize: 50,
    offset: 0,
    userId: ids.admin,
    warehouseId,
    date: `2021-05-${String(day).padStart(2, "0")}`,
  })
  return rows.reduce((sum, row) => sum + Number(row.qty), 0)
}

describe("kartu stok", () => {
  test("setiap kode pergerakan: arah sesuai kode, saldo berjalan = saldo per tanggal", async () => {
    for (const warehouseId of [ids.one, ids.two]) {
      const card = await stockCard({
        productId: ids.product,
        warehouseId,
        from: "2021-05-01",
        to: "2021-05-31",
      })
      expect(card.opening).toBe("0.0000")
      for (const line of card.lines) {
        const direction = MOVEMENT_CODE_DIRECTIONS[line.movementCode]
        const net = Number(line.inQty) - Number(line.outQty)
        expect([line.movementCode, Math.sign(net)]).toEqual([
          line.movementCode,
          direction === "in" ? 1 : direction === "out" ? -1 : 0,
        ])
        const day = Number(
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", day: "2-digit" }).format(
            line.doneAt,
          ),
        )
        expect([line.movementCode, Number(line.balance)]).toEqual([
          line.movementCode,
          await balanceOn(warehouseId, day),
        ])
      }
      expect(Number(card.closing)).toBe(await balanceOn(warehouseId, 31))
    }
  })

  test("semua kode pergerakan tercakup dan jenis pemakaian ikut", async () => {
    const [one, two] = await Promise.all(
      [ids.one, ids.two].map((warehouseId) =>
        stockCard({ productId: ids.product, warehouseId, from: "2021-05-01", to: "2021-05-31" }),
      ),
    )
    expect(one.lines.map((line) => line.movementCode)).toEqual([
      "gr",
      "ilt",
      "gi",
      "gr_rtn",
      "gi_rtn",
      "itw_out",
      "itw_rtn",
      "pu",
      "adj_in",
      "adj_out",
    ])
    expect(two.lines.map((line) => line.movementCode)).toEqual(["itw_in"])
    expect(one.lines.find((line) => line.movementCode === "pu")?.usageType).toBe("scrap")
    // 20 − 3 + 1 − 2 − 4 + 1 − 1 + 2 − 1 = 13 di gudang 1, 3 di gudang 2.
    expect([one.closing, two.closing]).toEqual(["13.0000", "3.0000"])
  })
})

describe("penelusuran lot", () => {
  test("riwayat masuk-keluar semua gudang dan saldo per lokasi", async () => {
    const trace = await getLotTrace(ids.admin, ids.lot)
    expect(trace?.name).toBe("ZK-LOT-1")
    expect(trace!.moves.map((row) => row.movementCode)).toEqual([
      "gr",
      "ilt",
      "gi",
      "gr_rtn",
      "gi_rtn",
      "itw_out",
      "itw_in",
      "itw_rtn",
      "pu",
      "adj_in",
      "adj_out",
    ])
    expect(trace!.moves[0]).toMatchObject({ partnerName: "Mitra kartu stok", qty: "20.0000" })
    expect(
      trace!.balances.map((row) => [row.warehouseCode, row.locationPath, row.qty, row.reservedQty]),
    ).toEqual([
      ["ZKG1", "ZKRA", "8.0000", "0.0000"],
      ["ZKG1", "ZKRB", "5.0000", "0.0000"],
      ["ZKG2", "ZKRC", "3.0000", "0.0000"],
    ])
  })

  test("hanya pergerakan di gudang yang boleh diakses", async () => {
    expect(await getLotTrace(ids.gudang, ids.lot)).toBeUndefined()
  })
})
