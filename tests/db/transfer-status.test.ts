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

import { inRollback, pgErrorInSavepoint, purgeInventory, withLine } from "./helpers"

// Alur status transfer (backlog R-06). Semua data uji berawalan ZS2.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<"pcs" | "product" | "vendor" | "customer" | "rack" | "partner", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZS2CAT", name: "Unit uji status" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZS2PCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZS2P", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZS2G", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  const [vendor, customer, rack] = await db
    .insert(locations)
    .values([
      { code: "ZS2VEND", name: "Vendor", type: "vendor" as const },
      { code: "ZS2CUST", name: "Customer", type: "customer" as const },
      { code: "ZS2RAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.customer = customer.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZS2PART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: true,
      identityType: "other",
      identityNumber: "ZS2",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.delete(partners).where(eq(partners.code, "ZS2PART"))
  await db.delete(locations).where(like(locations.code, "ZS2%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZS2%"))
  await db.delete(products).where(like(products.sku, "ZS2%"))
  await db.delete(uoms).where(like(uoms.code, "ZS2%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZS2%"))
  await db.$client.end()
})

async function draft(
  tx: Tx,
  type: "receipt" | "delivery",
  qty: string,
  { scheduled = true }: { scheduled?: boolean } = {},
) {
  const [from, to] = type === "receipt" ? [ids.vendor, ids.rack] : [ids.rack, ids.customer]
  const [transfer] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      partnerId: ids.partner,
      scheduledDate: scheduled ? "2026-10-15" : null,
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
  return transfer.id
}

const call = async (tx: Tx, fn: string, id: string) =>
  (await tx.execute<{ result: string }>(sql`select ${sql.raw(fn)}(${id})::text as result`)).rows[0]
    .result

const statusOf = async (tx: Tx, id: string) =>
  (await tx.select({ status: transfers.status }).from(transfers).where(eq(transfers.id, id)))[0]
    .status

test("transfer masuk langsung Siap setelah Konfirmasi", async () => {
  await inRollback(db, async (tx) => {
    const id = await draft(tx, "receipt", "5")
    expect(await call(tx, "confirm_transfer", id)).toBe("ready")
  })
})

test("transfer keluar: Menunggu → Sebagian tersedia → Siap mengikuti stok", async () => {
  await inRollback(db, async (tx) => {
    const delivery = await draft(tx, "delivery", "10")
    expect(await call(tx, "confirm_transfer", delivery)).toBe("waiting")

    await tx.execute(sql`select validate_transfer(${await draft(tx, "receipt", "4")})`)
    expect(await call(tx, "check_transfer_availability", delivery)).toBe("partially_available")

    await tx.execute(sql`select validate_transfer(${await draft(tx, "receipt", "6")})`)
    expect(await call(tx, "check_transfer_availability", delivery)).toBe("ready")

    await tx.execute(sql`select reset_transfer_to_draft(${delivery})`)
    expect(await statusOf(tx, delivery)).toBe("draft")
  })
})

test("Konfirmasi mewajibkan baris dan tanggal rencana; hanya dari Draft", async () => {
  await inRollback(db, async (tx) => {
    const id = await draft(tx, "receipt", "1", { scheduled: false })
    expect(await pgErrorInSavepoint(tx, (sp) => call(sp, "confirm_transfer", id))).toBe(
      "Tanggal rencana wajib diisi sebelum konfirmasi.",
    )
    await tx.update(transfers).set({ scheduledDate: "2026-10-15" }).where(eq(transfers.id, id))
    await call(tx, "confirm_transfer", id)
    expect(await pgErrorInSavepoint(tx, (sp) => call(sp, "confirm_transfer", id))).toBe(
      "Hanya transfer Draft yang bisa dikonfirmasi.",
    )
  })
})

test("status hanya berubah lewat fungsi; transfer Selesai tidak bisa kembali ke Draft", async () => {
  await inRollback(db, async (tx) => {
    const id = await draft(tx, "receipt", "1")
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.update(transfers).set({ status: "ready" }).where(eq(transfers.id, id)),
      ),
    ).toBe(
      "Status transfer hanya bisa diubah lewat Konfirmasi, Cek stok, Kembali ke Draft, Batal, atau Validasi.",
    )
    await call(tx, "confirm_transfer", id)
    await tx.execute(sql`select validate_transfer(${id})`)
    expect(
      await pgErrorInSavepoint(tx, (sp) => sp.execute(sql`select reset_transfer_to_draft(${id})`)),
    ).toBe(
      "Hanya transfer yang sudah dikonfirmasi dan belum Selesai yang bisa dikembalikan ke Draft.",
    )
    expect(
      await pgErrorInSavepoint(tx, (sp) => sp.execute(sql`select cancel_transfer(${id})`)),
    ).toBe("Transfer yang sudah Selesai atau Batal tidak bisa dibatalkan.")
  })
})

test("Batal dari status mana pun sebelum Selesai", async () => {
  await inRollback(db, async (tx) => {
    const id = await draft(tx, "delivery", "3")
    await call(tx, "confirm_transfer", id)
    await tx.execute(sql`select cancel_transfer(${id})`)
    expect(await statusOf(tx, id)).toBe("cancelled")
  })
})
