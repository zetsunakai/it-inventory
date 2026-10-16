import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/server/db"

export type PeriodRow = {
  year: number
  month: number
  moveCount: number
  closedAt: Date | null
  closedByName: string | null
  // Bulan berjalan (belum berakhir), jadi belum bisa ditutup.
  current: boolean
}

// Bulan dari pergerakan Selesai pertama sampai bulan berjalan (WIB), terbaru di atas.
export async function listPeriods(): Promise<PeriodRow[]> {
  const result = await db.execute<{
    year: number
    month: number
    move_count: number
    closed_at: Date | null
    closed_by_name: string | null
    current: boolean
  }>(sql`
    with bounds as (
      select
        date_trunc('month', coalesce(min(done_at at time zone 'Asia/Jakarta'),
          now() at time zone 'Asia/Jakarta')) as first_month,
        date_trunc('month', now() at time zone 'Asia/Jakarta') as this_month
      from stock_moves where status = 'done'
    ),
    months as (
      select generate_series(first_month, this_month, interval '1 month') as first_day, this_month
      from bounds
    ),
    counts as (
      select date_trunc('month', done_at at time zone 'Asia/Jakarta') as first_day,
        count(*)::int as move_count
      from stock_moves where status = 'done' group by 1
    )
    select extract(year from m.first_day)::int as year, extract(month from m.first_day)::int as month,
      coalesce(c.move_count, 0) as move_count, p.closed_at,
      (select u.name from users u where u.id = p.closed_by) as closed_by_name,
      m.first_day = m.this_month as current
    from months m
    left join counts c on c.first_day = m.first_day
    left join inventory_periods p
      on p.year = extract(year from m.first_day) and p.month = extract(month from m.first_day)
    order by m.first_day desc`)
  return result.rows.map((row) => ({
    year: row.year,
    month: row.month,
    moveCount: row.move_count,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    closedByName: row.closed_by_name,
    current: row.current,
  }))
}
