import type { NextRequest } from "next/server"

import { lookupPage, lookupResponse } from "@/lib/lookup-page"

import { SEARCH_PARAM } from "@/lib/list-params"
import { getApiUser } from "@/server/auth/session"
import { searchPartners } from "@/modules/inventory/server/queries/transfers"

// Pencarian partner aktif: GET /api/partners?q=pt (nama atau NPWP).
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  const params = Object.fromEntries(request.nextUrl.searchParams)
  const search = (params[SEARCH_PARAM] ?? "").trim().slice(0, 100)
  const { offset, limit } = lookupPage(request.nextUrl.searchParams)
  return Response.json(lookupResponse(await searchPartners(search, offset, limit + 1), limit))
}
