import type { NextRequest } from "next/server"

import { pickFilter, SEARCH_PARAM } from "@/lib/list-params"
import { getApiUser } from "@/server/auth/session"
import { searchPartners } from "@/server/queries/transfers"

// Pencarian partner aktif per peran: GET /api/partners?role=vendor&q=pt
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  const params = Object.fromEntries(request.nextUrl.searchParams)
  const role = pickFilter(params, "role", ["vendor", "customer"] as const)
  if (!role) return Response.json({ error: "Peran partner tidak dikenal." }, { status: 400 })
  const search = (params[SEARCH_PARAM] ?? "").trim().slice(0, 100)
  return Response.json({ items: await searchPartners(role, search) })
}
