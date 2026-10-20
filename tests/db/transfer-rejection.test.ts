import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, expect, test } from "vitest"

import type { Role } from "@/lib/permissions"
import { db } from "@/server/db"
import {
  locations,
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

import { inRollback, pgErrorInSavepoint, purgeInventory, setAuditUser, withLine } from "./helpers"

// Penolakan scrap dan penyesuaian oleh Manajer (backlog I-03). Semua data uji berawalan ZRJ.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  "pcs" | "product" | "vendor" | "scrap" | "rack" | "warehouse" | "partner",
  string
>
const people = {} as Record<"manajer" | "gudang", string>

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZRJCAT", name: "Unit uji tolak" })
    .returning({ id: uomCategories.id })
  const [pcs] = await db
    .insert(uoms)
    .values({
      code: "ZRJPCS",
      name: "Buah",
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    .returning({ id: uoms.id })
  ids.pcs = pcs.id
  const [product] = await db
    .insert(products)
    .values({ sku: "ZRJP", name: "Baut", category: "raw_material", uomId: pcs.id })
    .returning({ id: products.id })
  ids.product = product.id
  const [warehouse] = await db
    .insert(warehouses)
    .values({ code: "ZRJG", name: "Gudang", address: "Bekasi" })
    .returning({ id: warehouses.id })
  ids.warehouse = warehouse.id
  const [vendor, scrap, rack] = await db
    .insert(locations)
    .values([
      { code: "ZRJVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZRJSCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZRJRAK", name: "Rak", type: "internal" as const, warehouseId: warehouse.id },
    ])
    .returning({ id: locations.id })
  ids.vendor = vendor.id
  ids.scrap = scrap.id
  ids.rack = rack.id
  const [partner] = await db
    .insert(partners)
    .values({
      code: "ZRJPART",
      name: "Partner uji",
      address: "Bekasi",
      countryCode: "ID",
      identityType: "other",
      identityNumber: "ZRJ",
    })
    .returning({ id: partners.id })
  ids.partner = partner.id
  for (const role of ["manajer", "admin_gudang"] as Role[]) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zrj-${role}@tolak.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    people[role === "manajer" ? "manajer" : "gudang"] = user.id
  }
})

afterAll(async () => {
  await purgeInventory(db, [ids.product])
  await db.delete(users).where(like(users.email, "zrj-%@tolak.test"))
  await db.delete(partners).where(eq(partners.code, "ZRJPART"))
  await db.delete(locations).where(like(locations.code, "ZRJ%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZRJ%"))
  await db.delete(products).where(like(products.sku, "ZRJ%"))
  await db.delete(uoms).where(like(uoms.code, "ZRJ%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZRJ%"))
  await db.$client.end()
})

async function transfer(tx: Tx, type: "receipt" | "scrap", qty: string) {
  const [from, to] = type === "receipt" ? [ids.vendor, ids.rack] : [ids.rack, ids.scrap]
  const [row] = await tx
    .insert(transfers)
    .values({
      type,
      sourceLocationId: from,
      destinationLocationId: to,
      scheduledDate: "2026-10-15",
      reason: type === "scrap" ? "Rusak" : null,
      partnerId: type === "receipt" ? ids.partner : null,
    })
    .returning({ id: transfers.id, number: transfers.number })
  await tx.insert(stockMoves).values(
    await withLine(tx, {
      transferId: row.id,
      productId: ids.product,
      inputQty: qty,
      inputUomId: ids.pcs,
      sourceLocationId: from,
      destinationLocationId: to,
    }),
  )
  return row
}

const saved = async (tx: Tx, id: string) =>
  (await tx.select().from(transfers).where(eq(transfers.id, id)))[0]

const reservedQty = async (tx: Tx, id: string) =>
  (
    await tx.execute<{ total: string }>(
      sql`select coalesce(sum(reserved_qty), 0)::text as total from stock_moves where transfer_id = ${id}`,
    )
  ).rows[0].total

// Scrap 2 dari stok 5, sudah dikonfirmasi (stok dipesan).
async function confirmedScrap(tx: Tx) {
  const receipt = await transfer(tx, "receipt", "5")
  await tx.execute(sql`select validate_transfer(${receipt.id})`)
  const scrap = await transfer(tx, "scrap", "2")
  await tx.execute(sql`select confirm_transfer(${scrap.id})`)
  return scrap
}

test("Manajer menolak dengan alasan: status Ditolak, pesanan stok dilepas", async () => {
  await inRollback(db, async (tx) => {
    await setAuditUser(tx, people.manajer)
    const scrap = await confirmedScrap(tx)
    expect(Number(await reservedQty(tx, scrap.id))).toBe(2)

    await tx.execute(sql`select reject_transfer(${scrap.id}, ${"  Qty tidak sesuai foto  "})`)
    const row = await saved(tx, scrap.id)
    expect(row.status).toBe("rejected")
    expect(row.rejectionReason).toBe("Qty tidak sesuai foto")
    expect(row.rejectedBy).toBe(people.manajer)
    expect(row.rejectedAt).not.toBeNull()
    expect(Number(await reservedQty(tx, scrap.id))).toBe(0)
  })
})

test("alasan wajib dan hanya Manajer; semua alasan dilaporkan sekaligus", async () => {
  await inRollback(db, async (tx) => {
    const scrap = await confirmedScrap(tx)
    await setAuditUser(tx, people.gudang)
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select reject_transfer(${scrap.id}, ' ')`),
      ),
    ).toBe("Hanya Manajer yang bisa menolak.\nAlasan penolakan wajib diisi.")
    expect((await saved(tx, scrap.id)).status).toBe("ready")
  })
})

test("hanya scrap/penyesuaian yang sudah dikonfirmasi yang bisa ditolak", async () => {
  await inRollback(db, async (tx) => {
    const draft = await transfer(tx, "scrap", "1")
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select reject_transfer(${draft.id}, 'x')`),
      ),
    ).toBe("Hanya transfer yang sudah dikonfirmasi dan belum Selesai yang bisa ditolak.")
    const receipt = await transfer(tx, "receipt", "1")
    await tx.execute(sql`select confirm_transfer(${receipt.id})`)
    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select reject_transfer(${receipt.id}, 'x')`),
      ),
    ).toBe("Transfer ini tidak memerlukan persetujuan.")
  })
})

test("transfer Ditolak tidak bisa disetujui atau divalidasi; kembali ke Draft lalu diulang", async () => {
  await inRollback(db, async (tx) => {
    await setAuditUser(tx, people.manajer)
    const scrap = await confirmedScrap(tx)
    await tx.execute(sql`select reject_transfer(${scrap.id}, 'Foto kurang jelas')`)

    expect(
      await pgErrorInSavepoint(tx, (sp) =>
        sp
          .update(transfers)
          .set({ approvedAt: new Date(), approvedBy: people.manajer })
          .where(eq(transfers.id, scrap.id)),
      ),
    ).toBe(`Transfer ${scrap.number} ditolak dan tidak bisa disetujui.`)
    expect(
      await pgErrorInSavepoint(tx, (sp) => sp.execute(sql`select validate_transfer(${scrap.id})`)),
    ).toBe(`Transfer ${scrap.number} ditolak. Kembalikan ke Draft, perbaiki, lalu konfirmasi lagi.`)

    await tx.execute(sql`select reset_transfer_to_draft(${scrap.id})`)
    const reopened = await saved(tx, scrap.id)
    expect(reopened.status).toBe("draft")
    // Alasan penolakan terakhir tetap tersimpan untuk pembuatnya.
    expect(reopened.rejectionReason).toBe("Foto kurang jelas")

    await tx.execute(sql`select confirm_transfer(${scrap.id})`)
    await tx
      .update(transfers)
      .set({ approvedAt: new Date(), approvedBy: people.manajer })
      .where(eq(transfers.id, scrap.id))
    await tx.execute(sql`select validate_transfer(${scrap.id})`)
    expect((await saved(tx, scrap.id)).status).toBe("done")
  })
})

test("transfer Ditolak bisa dibatalkan", async () => {
  await inRollback(db, async (tx) => {
    await setAuditUser(tx, people.manajer)
    const scrap = await confirmedScrap(tx)
    await tx.execute(sql`select reject_transfer(${scrap.id}, 'Tidak perlu')`)
    await tx.execute(sql`select cancel_transfer(${scrap.id})`)
    expect((await saved(tx, scrap.id)).status).toBe("cancelled")
  })
})
