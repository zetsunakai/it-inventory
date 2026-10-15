import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  partners,
  products,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import { inRollback, pgErrorInSavepoint, withLine, returnRequestFor } from "./helpers"

// Kode pergerakan (backlog R-04). Semua data uji berawalan ZC.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  | "pcs"
  | "product"
  | "partner"
  | "vendor"
  | "customer"
  | "scrap"
  | "adjustment"
  | "transit"
  | "rackA"
  | "rackB"
  | "rackOther",
  string
>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZCCAT", name: "Unit uji kode" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZCPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZCP", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZCG1", "ZCG2"].map((code) => ({
        code,
        name: code,
        address: "Bekasi",
      })),
    )
    .returning({ id: warehouses.id })
  const rows = await db
    .insert(locations)
    .values([
      { code: "ZCVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZCCUST", name: "Customer", type: "customer" as const },
      { code: "ZCSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZCADJ", name: "Penyesuaian", type: "adjustment" as const },
      { code: "ZCTRANS", name: "Transit", type: "transit" as const },
      { code: "ZCRA", name: "Rak A", type: "internal" as const, warehouseId: one.id },
      { code: "ZCRB", name: "Rak B", type: "internal" as const, warehouseId: one.id },
      { code: "ZCRC", name: "Rak C", type: "internal" as const, warehouseId: two.id },
    ])
    .returning({ id: locations.id })
  ;[
    ids.vendor,
    ids.customer,
    ids.scrap,
    ids.adjustment,
    ids.transit,
    ids.rackA,
    ids.rackB,
    ids.rackOther,
  ] = rows.map((row) => row.id)
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZCPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZC",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await db.delete(partners).where(eq(partners.code, "ZCPART"))
  await db.delete(locations).where(like(locations.code, "ZC%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZC%"))
  await db.delete(products).where(like(products.sku, "ZC%"))
  await db.delete(uoms).where(like(uoms.code, "ZC%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZC%"))
  await db.$client.end()
})

type Type = (typeof transfers.$inferInsert)["type"]

async function transfer(tx: Tx, type: Type, from: string, to: string, returnOfId?: string) {
  const [row] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      partnerId: ["receipt", "delivery", "return"].includes(type) ? ids.partner : null,
      returnOfId,
      returnRequestId: returnOfId ? await returnRequestFor(tx, returnOfId) : null,
    })
    .returning({ id: transfers.id, code: transfers.movementCode, direction: transfers.direction })
  await tx.insert(stockMoves).values(
    await withLine(tx, {
      transferId: row.id,
      productId: ids.product,
      inputQty: "1",
      inputUomId: ids.pcs,
      sourceLocationId: from,
      destinationLocationId: to,
    }),
  )
  return row
}

test("kode dan arah pergerakan diisi database dari jenis dan lokasi transfer", async () => {
  await inRollback(db, async (tx) => {
    const receipt = await transfer(tx, "receipt", ids.vendor, ids.rackA)
    const delivery = await transfer(tx, "delivery", ids.rackA, ids.customer)
    await tx.execute(sql`select validate_transfer(${receipt.id})`)
    await tx.execute(sql`select validate_transfer(${delivery.id})`)

    const cases = [
      [receipt, "gr", "in"],
      [delivery, "gi", "out"],
      [await transfer(tx, "internal", ids.rackA, ids.rackB), "ilt", "internal"],
      [await transfer(tx, "internal", ids.rackA, ids.transit), "itw_out", "out"],
      [await transfer(tx, "internal", ids.transit, ids.rackOther), "itw_in", "in"],
      [await transfer(tx, "scrap", ids.rackA, ids.scrap), "pu", "out"],
      [await transfer(tx, "adjustment", ids.adjustment, ids.rackA), "adj_in", "in"],
      [await transfer(tx, "adjustment", ids.rackA, ids.adjustment), "adj_out", "out"],
      [await transfer(tx, "return", ids.rackA, ids.vendor, receipt.id), "gr_rtn", "out"],
      [await transfer(tx, "return", ids.customer, ids.rackA, delivery.id), "gi_rtn", "in"],
    ] as const
    expect(cases.map(([row]) => [row.code, row.direction])).toEqual(
      cases.map(([, code, direction]) => [code, direction]),
    )
  })
})

test("kode ikut berubah saat lokasi Draft diganti dan disalin ke baris saat validasi", async () => {
  await inRollback(db, async (tx) => {
    const draft = await transfer(tx, "internal", ids.rackA, ids.rackB)
    const [moved] = await tx
      .update(transfers)
      .set({ destinationLocationId: ids.transit })
      .where(eq(transfers.id, draft.id))
      .returning({ code: transfers.movementCode })
    expect(moved.code).toBe("itw_out")
    // Pindah langsung ke lokasi internal gudang lain ditolak (R-09).
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp
          .update(transfers)
          .set({ destinationLocationId: ids.rackOther })
          .where(eq(transfers.id, draft.id)),
      ),
    ).toBe(
      "Pindah lokasi hanya di dalam satu gudang. Barang antar gudang dipindah lewat lokasi transit.",
    )

    const receipt = await transfer(tx, "receipt", ids.vendor, ids.rackA)
    const [before] = await tx
      .select({ code: stockMoves.movementCode })
      .from(stockMoves)
      .where(eq(stockMoves.transferId, receipt.id))
    expect(before.code).toBeNull()
    await tx.execute(sql`select validate_transfer(${receipt.id})`)
    const [after] = await tx
      .select({ code: stockMoves.movementCode })
      .from(stockMoves)
      .where(eq(stockMoves.transferId, receipt.id))
    expect(after.code).toBe("gr")
  })
})

test("jenis pemakaian hanya untuk pu; susut transit hanya dari transit; lanjutan mewarisi jenisnya", async () => {
  await inRollback(db, async (tx) => {
    const usage = async (id: string) =>
      (
        await tx.execute<{ usage_type: string | null }>(
          sql`select usage_type from transfers where id = ${id}`,
        )
      ).rows[0].usage_type
    const scrap = await transfer(tx, "scrap", ids.rackA, ids.scrap)
    const loss = await transfer(tx, "scrap", ids.transit, ids.scrap)
    const internal = await transfer(tx, "internal", ids.rackA, ids.rackB)
    expect([await usage(scrap.id), await usage(loss.id), await usage(internal.id)]).toEqual([
      "scrap",
      "transit_loss",
      null,
    ])
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`update transfers set usage_type = 'transit_loss' where id = ${scrap.id}`),
      ),
    ).toBe(
      "Susut transit hanya dicatat dari lokasi transit, lewat permintaan transfer antar gudang.",
    )
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`update transfers set usage_type = 'usage' where id = ${internal.id}`),
      ),
    ).toBe("Jenis pemakaian hanya untuk transfer pemakaian dan scrap.")

    await tx.execute(sql`update transfers set usage_type = 'usage' where id = ${scrap.id}`)
    const [backorder] = (
      await tx.execute<{ id: string }>(sql`
        insert into transfers (type, source_location_id, destination_location_id, backorder_of_id)
        values ('scrap', ${ids.rackA}, ${ids.scrap}, ${scrap.id}) returning id`)
    ).rows
    expect(await usage(backorder.id)).toBe("usage")
  })
})
