import { sql } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { getApiUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { stockAvailability } from "@/modules/inventory/server/queries/transfers"

// Saldo produk di satu lokasi untuk form barang keluar:
//   GET /api/stock-availability?product=<id>&location=<id>
// Hanya untuk lokasi di gudang yang boleh diakses user.
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  const params = request.nextUrl.searchParams
  const productId = params.get("product") ?? ""
  const locationId = params.get("location") ?? ""
  if (!z.uuid().safeParse(productId).success || !z.uuid().safeParse(locationId).success) {
    return Response.json({ error: "Produk atau lokasi tidak valid." }, { status: 400 })
  }
  const access = await db.execute<{ allowed: boolean }>(sql`
    select coalesce(bool_and(warehouse_id is null or can_access_warehouse(${user.id}, warehouse_id)), false) as allowed
    from locations where id = ${locationId}`)
  if (!access.rows[0]?.allowed) {
    return Response.json({ error: "Lokasi tidak ditemukan." }, { status: 404 })
  }
  return Response.json(await stockAvailability(productId, locationId))
}
