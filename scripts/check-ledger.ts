// Periksa konsistensi saldo dengan ledger (backlog R-15). Hanya membaca, tidak mengubah data:
//   npm run db:check
// Yang dicek:
//   1. stock_balances.qty sama dengan saldo dari stock_moves Selesai (stock_on_hand sekarang);
//   2. stock_balances.reserved_qty sama dengan jumlah qty dipesan pergerakan transfer terbuka;
//   3. transfer Selesai punya kode pergerakan dan setiap pergerakannya Selesai dengan kode sama.
// Keluar dengan kode 1 bila ada selisih.

import { loadEnvConfig } from "@next/env"
import { sql } from "drizzle-orm"

import { createDb } from "../src/server/db/client"

async function main() {
  loadEnvConfig(process.cwd())
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL belum diisi.")
  const { db, pool } = createDb(url)
  try {
    const checks: [string, string][] = [
      [
        "Saldo berbeda dengan ledger",
        `select p.sku, lp.path, l.name as lot, coalesce(b.qty, 0) as saldo, coalesce(h.qty, 0) as ledger
         from (select product_id, location_id, lot_id, qty from stock_balances where qty <> 0) b
         full join stock_on_hand(now()) h on h.product_id = b.product_id
           and h.location_id = b.location_id and h.lot_id is not distinct from b.lot_id
         join products p on p.id = coalesce(b.product_id, h.product_id)
         join location_paths lp on lp.id = coalesce(b.location_id, h.location_id)
         left join lots l on l.id = coalesce(b.lot_id, h.lot_id)
         where coalesce(b.qty, 0) <> coalesce(h.qty, 0)`,
      ],
      [
        "Qty dipesan berbeda dengan pergerakan terbuka",
        `select p.sku, lp.path, coalesce(b.reserved_qty, 0) as dipesan, coalesce(m.qty, 0) as pergerakan
         from (select product_id, location_id, lot_id, reserved_qty from stock_balances
               where reserved_qty <> 0) b
         full join (
           select m.product_id, m.source_location_id as location_id, m.lot_id,
             sum(m.reserved_qty) as qty
           from stock_moves m join transfers t on t.id = m.transfer_id
           where m.reserved_qty > 0 and t.status::text not in ('done', 'cancelled')
           group by 1, 2, 3
         ) m on m.product_id = b.product_id and m.location_id = b.location_id
           and m.lot_id is not distinct from b.lot_id
         join products p on p.id = coalesce(b.product_id, m.product_id)
         join location_paths lp on lp.id = coalesce(b.location_id, m.location_id)
         where coalesce(b.reserved_qty, 0) <> coalesce(m.qty, 0)`,
      ],
      [
        "Transfer Selesai dengan pergerakan tidak lengkap",
        `select t.number, m.status, m.movement_code, t.movement_code as kode_transfer
         from transfers t join stock_moves m on m.transfer_id = t.id
         where t.status::text = 'done'
           and (m.status <> 'done' or m.movement_code is distinct from t.movement_code)`,
      ],
    ]
    let problems = 0
    for (const [label, query] of checks) {
      const result = await db.execute(sql.raw(query))
      if (result.rows.length) {
        problems += result.rows.length
        console.error(`✗ ${label}: ${result.rows.length} baris`)
        console.table(result.rows.slice(0, 20))
      } else {
        console.log(`✓ ${label}: tidak ada`)
      }
    }
    const [{ moves, balances }] = (
      await db.execute<{ moves: number; balances: number }>(sql`
        select (select count(*)::int from stock_moves where status = 'done') as moves,
          (select count(*)::int from stock_balances where qty <> 0) as balances`)
    ).rows
    console.log(`Diperiksa: ${moves} pergerakan Selesai, ${balances} baris saldo.`)
    if (problems) process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
