import type { NextRequest } from "next/server"
import { z } from "zod"

import { SEARCH_PARAM } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { searchOriginOptions } from "@/modules/it-inventory/server/queries/customs-transfers"
import { getApiUser } from "@/server/auth/session"

// Saldo asal yang bisa dialokasikan ke baris dokumen keluar (M4-05):
// GET /api/customs-origins?line=<id baris dokumen keluar>&q=<nomor aju/daftar>
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const line = z.uuid().safeParse(request.nextUrl.searchParams.get("line"))
  if (!line.success) return Response.json({ items: [] })
  const search = (request.nextUrl.searchParams.get(SEARCH_PARAM) ?? "").trim().slice(0, 100)
  return Response.json({ items: await searchOriginOptions(line.data, search) })
}
