import { sql } from "drizzle-orm"
import { afterAll, expect, test } from "vitest"

import { DEMO_SCENARIOS } from "@/modules/inventory/lib/demo-scenarios"
import { generateInventoryDemo } from "@/modules/inventory/server/demo-data"
import type { Transaction } from "@/server/db/audit"
import { createDb, type Db } from "@/server/db/client"
import { locations, uomCategories, uoms, userRoles, users } from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../test-env"
import { inRollback } from "./helpers"

// Data demo inventory 10 studi kasus kawasan berikat: semua lewat alur nyata, saldo akhir sesuai
// cerita, pekerjaan yang masih berjalan punya status yang benar, dan bisa dijalankan berulang
// (master dipakai ulang, satu putaran per panggilan). Semua di-rollback.

const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

async function baseData(tx: Transaction) {
  // Lokasi virtual dan satuan dari seed utama bila belum ada di database tes.
  await tx
    .insert(locations)
    .values([
      { code: "VENDOR", name: "Vendor", type: "vendor" as const },
      { code: "CUSTOMER", name: "Customer", type: "customer" as const },
      { code: "SCRAP", name: "Scrap", type: "scrap" as const },
      { code: "PENYESUAIAN", name: "Penyesuaian stok", type: "adjustment" as const },
      { code: "TRANSIT", name: "Transit antar gudang", type: "transit" as const },
    ])
    .onConflictDoNothing()
  for (const [category, code] of [
    ["ZDMLEN", "M"],
    ["ZDMUNIT", "PCS"],
    ["ZDMKG", "KG"],
    ["ZDML", "L"],
    ["ZDMM3", "M3"],
  ]) {
    const [row] = await tx
      .insert(uomCategories)
      .values({ code: category, name: `Uji demo ${code}` })
      .returning({ id: uomCategories.id })
    await tx
      .insert(uoms)
      .values({ code, name: code, categoryId: row.id, factor: "1", isReference: true })
      .onConflictDoNothing()
  }
  const [admin] = await tx
    .insert(users)
    .values({ name: "Admin demo", email: "zdm-admin@demo.test", emailVerified: true })
    .returning({ id: users.id })
  await tx.insert(userRoles).values({ userId: admin.id, role: "administrator" })
  await tx.execute(sql`select set_config('app.user_id', ${admin.id}, true)`)
  return admin.id
}

test("garmen dua putaran: saldo berlipat, master tidak dobel", async () => {
  await inRollback(db as unknown as Db, async (tx) => {
    const adminId = await baseData(tx)
    expect(await generateInventoryDemo(tx, adminId, "garmen")).toEqual({
      scenario: "garmen",
      run: 1,
      transfers: 24,
    })
    // Putaran kedua: tanggalnya sama (45 hari ke belakang), tapi setiap putaran memasukkan bahan
    // sebelum memakainya, jadi validasi bertanggal mundur tetap lolos dan saldo konsisten.
    expect(await generateInventoryDemo(tx, adminId, "garmen")).toEqual({
      scenario: "garmen",
      run: 2,
      transfers: 24,
    })
    const {
      rows: [masters],
    } = await tx.execute<{ warehouses: number; products: number; partners: number }>(sql`
      select (select count(*) from warehouses where code like 'GRM-%')::int as warehouses,
        (select count(*) from products where sku like 'GRM-%')::int as products,
        (select count(*) from partners where code like 'GRM-%')::int as partners`)
    expect(masters).toEqual({ warehouses: 2, products: 10, partners: 7 })

    // Saldo akhir dua kali saldo satu putaran.
    const { rows: stock } = await tx.execute<{ sku: string; location: string; qty: string }>(sql`
      select p.sku, l.code as location, sum(b.qty)::float8::text as qty
      from stock_balances b
      join products p on p.id = b.product_id
      join locations l on l.id = b.location_id
      where p.sku like 'GRM-%' and b.qty <> 0 and l.type in ('internal', 'transit')
      group by p.sku, l.code order by p.sku, l.code`)
    expect(stock).toEqual([
      { sku: "GRM-BNG-PES", location: "GRM-GBB-LOK", qty: "360" },
      { sku: "GRM-CLN-CHN", location: "GRM-GBJ-A", qty: "320" },
      { sku: "GRM-KAIN-PLN", location: "GRM-GBB-IMP", qty: "1900" },
      { sku: "GRM-KAIN-TWL", location: "GRM-GBB-IMP", qty: "3600" },
      { sku: "GRM-KCG-PLS", location: "GRM-GBB-LOK", qty: "24000" },
      { sku: "GRM-KMJ-PJG", location: "GRM-GBJ-A", qty: "370" },
      { sku: "GRM-KTN-BOX", location: "GRM-GBB-LOK", qty: "200" },
      { sku: "GRM-KTN-BOX", location: "GRM-GBJ-A", qty: "200" },
      { sku: "GRM-KTN-BOX", location: "TRANSIT", qty: "200" },
      { sku: "GRM-LBL-WVN", location: "GRM-GBB-LOK", qty: "20000" },
      { sku: "GRM-RSL-LGM", location: "GRM-GBB-LOK", qty: "4000" },
      { sku: "GRM-SCR-KAIN", location: "GRM-GBB-WASTE", qty: "50" },
    ])
    // Riwayat tersebar 45 hari ke belakang (validasi bertanggal mundur oleh sistem).
    const {
      rows: [span],
    } = await tx.execute<{ days: number }>(sql`
      select (max(t.done_at)::date - min(t.done_at)::date)::int as days
      from transfers t join transfer_lines l on l.transfer_id = t.id
      join products p on p.id = l.product_id
      where t.status = 'done' and p.sku like 'GRM-%'`)
    expect(span.days).toBeGreaterThanOrEqual(44)
  })
})

test("kesepuluh studi kasus jalan, tanpa saldo minus, pekerjaan hari ini berstatus benar", async () => {
  await inRollback(db as unknown as Db, async (tx) => {
    const adminId = await baseData(tx)
    for (const scenario of DEMO_SCENARIOS) {
      const summary = await generateInventoryDemo(tx, adminId, scenario.key)
      expect(summary).toMatchObject({ scenario: scenario.key, run: 1 })

      const {
        rows: [negative],
      } = await tx.execute<{ total: number }>(sql`
        select count(*)::int as total from stock_balances b
        join products p on p.id = b.product_id
        join locations l on l.id = b.location_id
        where p.sku like ${`${scenario.prefix}-%`} and l.type = 'internal' and b.qty < 0`)
      expect([scenario.key, negative.total]).toEqual([scenario.key, 0])

      // Kontainer impor Siap, order lokal Draft, ekspor berikutnya Sebagian tersedia, jual lokal
      // Siap, kemasan di perjalanan (kaki masuk Siap), bahan rusak menunggu persetujuan (Siap).
      const { rows: open } = await tx.execute<{ reference: string | null; status: string }>(sql`
        select t.reference, t.status from transfers t
        join transfer_lines l on l.transfer_id = t.id
        join products p on p.id = l.product_id
        where p.sku like ${`${scenario.prefix}-%`} and t.status not in ('done', 'cancelled')
        group by t.id order by t.status, t.reference nulls last`)
      const p = scenario.prefix
      expect([scenario.key, open]).toEqual([
        scenario.key,
        [
          { reference: `PO-${p}-0104`, status: "draft" },
          { reference: `PO-${p}-0181`, status: "partially_available" },
          { reference: `INV-${p}-0102`, status: "ready" },
          { reference: expect.stringMatching(/^ITW\//), status: "ready" },
          { reference: `SO-${p}-0112`, status: "ready" },
          { reference: null, status: "ready" },
        ],
      ])
    }
  })
})
