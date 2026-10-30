import { eq, inArray, like, or } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "@/server/db"
import {
  locations,
  lots,
  partners,
  products,
  stockBalances,
  stockMoves,
  transfers,
  uomCategories,
  uoms,
  warehouses,
} from "@/server/db/schema"

import {
  enableLedgerWrite,
  inRollback,
  pgErrorInSavepoint,
  pgErrorMessage,
  setAuditUser,
  withLine,
  returnRequestFor,
} from "../../shared/db/helpers"

// Skema inventory (backlog M2-01): transfer, ledger pergerakan, lot, dan saldo, dengan aturan
// yang dipaksakan database. Semua data uji berawalan ZI.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = {} as Record<
  | "pcs"
  | "dozen"
  | "kg"
  | "product"
  | "archivedProduct"
  | "otherProduct"
  | "vendor"
  | "customer"
  | "scrap"
  | "adjustment"
  | "rack"
  | "bin"
  | "archivedRack"
  | "otherWarehouseRack"
  | "partner"
  | "archivedPartner",
  string
>

beforeAll(async () => {
  const [pieces, weight] = await db
    .insert(uomCategories)
    .values([
      { code: "ZICAT", name: "Unit uji inventory" },
      { code: "ZIKGC", name: "Berat uji inventory" },
    ])
    .returning({ id: uomCategories.id })
  const units = await db
    .insert(uoms)
    .values([
      { code: "ZIPCS", name: "Buah", categoryId: pieces.id, factor: "1", isReference: true },
      { code: "ZILSN", name: "Lusin", categoryId: pieces.id, factor: "12" },
      { code: "ZIKG", name: "Kilogram", categoryId: weight.id, factor: "1", isReference: true },
    ])
    .returning({ id: uoms.id })
  ;[ids.pcs, ids.dozen, ids.kg] = units.map((row) => row.id)

  const productRows = await db
    .insert(products)
    .values([
      { sku: "ZIP1", name: "Baut", category: "raw_material", uomId: ids.pcs },
      { sku: "ZIP2", name: "Lama", category: "raw_material", uomId: ids.pcs, active: false },
      { sku: "ZIP3", name: "Mur", category: "raw_material", uomId: ids.pcs },
    ])
    .returning({ id: products.id })
  ;[ids.product, ids.archivedProduct, ids.otherProduct] = productRows.map((row) => row.id)

  const [one, two] = await db
    .insert(warehouses)
    .values(
      ["ZIG1", "ZIG2"].map((code) => ({
        code,
        name: code,
        address: "Bekasi",
      })),
    )
    .returning({ id: warehouses.id })
  const virtual = await db
    .insert(locations)
    .values([
      { code: "ZIVEND", name: "Vendor", type: "vendor" as const },
      { code: "ZICUST", name: "Customer", type: "customer" as const },
      { code: "ZISCRAP", name: "Scrap", type: "scrap" as const },
      { code: "ZIADJ", name: "Penyesuaian", type: "adjustment" as const },
    ])
    .returning({ id: locations.id })
  ;[ids.vendor, ids.customer, ids.scrap, ids.adjustment] = virtual.map((row) => row.id)
  const [rack] = await db
    .insert(locations)
    .values({ code: "ZIRAK", name: "Rak", type: "internal", warehouseId: one.id })
    .returning({ id: locations.id })
  ids.rack = rack.id
  const internal = await db
    .insert(locations)
    .values([
      { code: "ZIBIN", name: "Bin", type: "internal", warehouseId: one.id, parentId: rack.id },
      { code: "ZIOLD", name: "Lama", type: "internal", warehouseId: one.id, active: false },
      { code: "ZIRAK2", name: "Rak gudang 2", type: "internal", warehouseId: two.id },
    ])
    .returning({ id: locations.id })
  ;[ids.bin, ids.archivedRack, ids.otherWarehouseRack] = internal.map((row) => row.id)

  const partnerRows = await db
    .insert(partners)
    .values(
      [
        { code: "ZIV", active: true },
        { code: "ZIOLD", active: false },
      ].map(({ code, active }) => ({
        code,
        name: code,
        address: "Bekasi",
        countryCode: "ID",
        identityType: "other" as const,
        identityNumber: code,
        active,
      })),
    )
    .returning({ id: partners.id })
  ;[ids.partner, ids.archivedPartner] = partnerRows.map((row) => row.id)
})

afterAll(async () => {
  const fixtureLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .where(like(locations.code, "ZI%"))
  const locationIds = fixtureLocations.map((row) => row.id)
  // Transfer yang tersimpan oleh tes penomoran bersamaan.
  await db
    .delete(transfers)
    .where(
      or(
        inArray(transfers.sourceLocationId, locationIds),
        inArray(transfers.destinationLocationId, locationIds),
      ),
    )
  await db.update(locations).set({ parentId: null }).where(like(locations.code, "ZI%"))
  await db.delete(locations).where(like(locations.code, "ZI%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZI%"))
  await db.delete(partners).where(like(partners.code, "ZI%"))
  await db.delete(products).where(like(products.sku, "ZI%"))
  await db.delete(uoms).where(like(uoms.code, "ZI%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZI%"))
  await db.$client.end()
})

function receipt(tx: Tx, values: Partial<typeof transfers.$inferInsert> = {}) {
  return tx
    .insert(transfers)
    .values({
      type: "receipt",
      sourceLocationId: ids.vendor,
      destinationLocationId: ids.rack,
      partnerId: ids.partner,
      ...values,
    })
    .returning()
}

async function move(
  tx: Tx,
  transferId: string,
  values: Partial<typeof stockMoves.$inferInsert> = {},
) {
  const row = {
    transferId,
    productId: ids.product,
    inputQty: "1",
    inputUomId: ids.pcs,
    sourceLocationId: ids.vendor,
    destinationLocationId: ids.rack,
    ...values,
  }
  return tx
    .insert(stockMoves)
    .values(await withLine(tx, row))
    .returning()
}

describe("transfer", () => {
  test("nomor dibuat database per jenis dan tahun, pembuat dari app.user_id", async () => {
    await inRollback(db, async (tx) => {
      const user = crypto.randomUUID()
      await setAuditUser(tx, user)
      const [first] = await receipt(tx)
      const [second] = await receipt(tx)
      const year = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
      }).format(new Date())
      expect(first.number).toMatch(new RegExp(`^PNR/${year}/\\d{5}$`))
      expect(Number(second.number.slice(-5))).toBe(Number(first.number.slice(-5)) + 1)
      expect([first.status, first.createdBy]).toEqual(["draft", user])
    })
  })

  test("nomor tetap unik walaupun 10 transfer dibuat bersamaan", async () => {
    const rows = await Promise.all(
      Array.from({ length: 10 }, () =>
        db
          .insert(transfers)
          .values({
            type: "internal",
            sourceLocationId: ids.rack,
            destinationLocationId: ids.bin,
          })
          .returning({ number: transfers.number }),
      ),
    )
    const numbers = rows.map(([row]) => row.number)
    expect(new Set(numbers).size).toBe(10)
  })

  test("asal dan tujuan harus sesuai jenis transfer", async () => {
    for (const [values, message] of [
      [
        { type: "receipt", sourceLocationId: ids.rack, destinationLocationId: ids.vendor },
        "Penerimaan harus dari lokasi vendor ke lokasi internal gudang.",
      ],
      [
        { type: "delivery", sourceLocationId: ids.vendor, destinationLocationId: ids.customer },
        "Pengiriman harus dari lokasi internal gudang ke lokasi customer.",
      ],
      [
        { type: "scrap", sourceLocationId: ids.rack, destinationLocationId: ids.customer },
        "Scrap harus dari lokasi internal gudang (atau transit) ke lokasi scrap.",
      ],
      [
        { type: "adjustment", sourceLocationId: ids.vendor, destinationLocationId: ids.rack },
        "Penyesuaian harus antara lokasi penyesuaian dan lokasi internal gudang.",
      ],
    ] as const) {
      await inRollback(db, async (tx) => {
        expect(await pgErrorMessage(receipt(tx, values))).toContain(message)
      })
    }
    await inRollback(db, async (tx) => {
      const [adjustment] = await receipt(tx, {
        type: "adjustment",
        sourceLocationId: ids.rack,
        destinationLocationId: ids.adjustment,
        partnerId: null,
      })
      expect(adjustment.number).toMatch(/^ADJ\//)
    })
  })

  test("penerimaan, pengiriman, dan retur wajib punya partner; partner arsip ditolak", async () => {
    await inRollback(db, async (tx) => {
      expect(await pgErrorMessage(receipt(tx, { partnerId: null }))).toContain(
        "transfers_partner_required",
      )
    })
    await inRollback(db, async (tx) => {
      expect(await pgErrorMessage(receipt(tx, { partnerId: ids.archivedPartner }))).toContain(
        "Partner sudah diarsipkan.",
      )
    })
  })

  test("lokasi arsip tidak bisa dipakai untuk transfer baru", async () => {
    await inRollback(db, async (tx) => {
      expect(await pgErrorMessage(receipt(tx, { destinationLocationId: ids.archivedRack }))).toBe(
        "Lokasi tujuan ZIOLD sudah diarsipkan.",
      )
    })
  })

  test("retur hanya dari penerimaan/pengiriman Selesai, dengan arah terbalik", async () => {
    await inRollback(db, async (tx) => {
      const [draft] = await receipt(tx)
      expect(
        await pgErrorMessage(
          receipt(tx, {
            type: "return",
            returnOfId: draft.id,
            sourceLocationId: ids.rack,
            destinationLocationId: ids.vendor,
          }),
        ),
      ).toBe("Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai.")
    })
    await inRollback(db, async (tx) => {
      await enableLedgerWrite(tx)
      const [done] = await receipt(tx, { status: "done", doneAt: new Date() })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          receipt(sp, {
            type: "return",
            returnOfId: done.id,
            sourceLocationId: ids.vendor,
            destinationLocationId: ids.rack,
          }),
        ),
      ).toBe("Retur harus kebalikan arah transfer asalnya.")
      const [ret] = await receipt(tx, {
        type: "return",
        returnOfId: done.id,
        returnRequestId: await returnRequestFor(tx, done.id),
        sourceLocationId: ids.rack,
        destinationLocationId: ids.vendor,
      })
      expect(ret.number).toMatch(/^RTR\//)
    })
  })

  test("jenis transfer tidak bisa diubah; status Selesai wajib bertanggal", async () => {
    await inRollback(db, async (tx) => {
      const [row] = await receipt(tx)
      expect(
        await pgErrorMessage(
          tx.update(transfers).set({ type: "internal" }).where(eq(transfers.id, row.id)),
        ),
      ).toBe("Jenis transfer tidak bisa diubah.")
    })
    await inRollback(db, async (tx) => {
      await enableLedgerWrite(tx)
      expect(await pgErrorMessage(receipt(tx, { status: "done" }))).toContain(
        "transfers_done_has_date",
      )
    })
  })
})

describe("baris pergerakan", () => {
  test("qty dikonversi ke satuan stok; satuan beda kategori ditolak", async () => {
    await inRollback(db, async (tx) => {
      const [transfer] = await receipt(tx)
      const [row] = await move(tx, transfer.id, { inputQty: "2", inputUomId: ids.dozen })
      expect(row.qty).toBe("24.0000")
      expect([row.sourceWarehouseId, row.destinationWarehouseId]).toEqual([
        null,
        expect.any(String),
      ])
      expect(await pgErrorMessage(move(tx, transfer.id, { inputUomId: ids.kg }))).toContain(
        "Konversi antar kategori satuan yang berbeda tidak diizinkan.",
      )
    })
  })

  test("lot harus milik produknya; nomor lot unik per produk", async () => {
    await inRollback(db, async (tx) => {
      const [lot] = await tx
        .insert(lots)
        .values({ productId: ids.otherProduct, name: " L-001 " })
        .returning()
      expect(lot.name).toBe("L-001")
      const [transfer] = await receipt(tx)
      expect(await pgErrorInSavepoint(tx, (sp) => move(sp, transfer.id, { lotId: lot.id }))).toBe(
        "Lot bukan milik produk ZIP1.",
      )
      expect(
        await pgErrorMessage(
          tx.insert(lots).values({ productId: ids.otherProduct, name: "L-001" }),
        ),
      ).toContain("lots_product_name_unique")
    })
  })

  test("lokasi baris harus di gudang yang sama dengan lokasi transfer", async () => {
    await inRollback(db, async (tx) => {
      const [transfer] = await receipt(tx)
      // Sub-lokasi lain di gudang yang sama boleh (mis. langsung ke bin).
      await move(tx, transfer.id, { destinationLocationId: ids.bin })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          move(sp, transfer.id, { destinationLocationId: ids.otherWarehouseRack }),
        ),
      ).toBe("Lokasi tujuan baris ZIP1 tidak sesuai lokasi tujuan transfer.")
      expect(await pgErrorMessage(move(tx, transfer.id, { sourceLocationId: ids.customer }))).toBe(
        "Lokasi asal baris ZIP1 tidak sesuai lokasi asal transfer.",
      )
    })
  })

  test("produk arsip tidak bisa dipakai untuk baris baru", async () => {
    await inRollback(db, async (tx) => {
      const [transfer] = await receipt(tx)
      expect(await pgErrorMessage(move(tx, transfer.id, { productId: ids.archivedProduct }))).toBe(
        "Produk ZIP2 sudah diarsipkan.",
      )
    })
  })

  test("baris Selesai wajib punya tanggal dan salinan kategori", async () => {
    await inRollback(db, async (tx) => {
      const [transfer] = await receipt(tx)
      await enableLedgerWrite(tx)
      expect(await pgErrorMessage(move(tx, transfer.id, { status: "done" }))).toContain(
        "stock_moves_done_complete",
      )
    })
  })
})

test("saldo unik per produk × lokasi × lot, termasuk saat lot kosong", async () => {
  await inRollback(db, async (tx) => {
    await enableLedgerWrite(tx)
    await tx.insert(stockBalances).values({ productId: ids.product, locationId: ids.rack })
    expect(
      await pgErrorMessage(
        tx.insert(stockBalances).values({ productId: ids.product, locationId: ids.rack }),
      ),
    ).toContain("stock_balances_product_location_lot_unique")
  })
})
