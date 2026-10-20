import { and, eq, sql } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { pickFilter } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { exportStockCount } from "@/modules/inventory/server/stock-count-io"
import { getApiUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { stockCounts } from "@/server/db/schema"
import { SPREADSHEET_FORMATS, spreadsheetResponse } from "@/server/spreadsheet"

// Unduhan daftar hitung stock opname (I-04): GET /inventory/opname/<id>/export?format=xlsx|csv.
// Untuk diisi di lapangan lalu diimpor kembali; qty sistem tidak ikut (hitung buta).
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/inventory/opname/[id]/export">,
) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "inventory:read")) {
    return Response.json({ error: "Anda tidak punya izin." }, { status: 403 })
  }
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 })
  const [session] = await db
    .select({ number: stockCounts.number })
    .from(stockCounts)
    .where(
      and(
        eq(stockCounts.id, id),
        sql`can_access_warehouse(${user.id}, ${stockCounts.warehouseId})`,
      ),
    )
  if (!session) return new Response(null, { status: 404 })
  const format =
    pickFilter(Object.fromEntries(request.nextUrl.searchParams), "format", SPREADSHEET_FORMATS) ??
    "xlsx"
  return spreadsheetResponse(
    format,
    `daftar-hitung-${session.number.replaceAll("/", "-")}`,
    await exportStockCount(format, id),
  )
}
