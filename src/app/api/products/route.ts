import type { NextRequest } from "next/server"

import { lookupPage, lookupResponse } from "@/lib/lookup-page"

import { SEARCH_PARAM } from "@/lib/list-params"
import { getApiUser } from "@/server/auth/session"
import { searchProducts } from "@/modules/inventory/server/queries/transfers"

// Pencarian produk aktif untuk baris transfer: GET /api/products?q=baut
// Semua user yang sudah login boleh mencari, sama seperti /api/ref-codes.
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  const search = (request.nextUrl.searchParams.get(SEARCH_PARAM) ?? "").trim().slice(0, 100)
  const { offset, limit } = lookupPage(request.nextUrl.searchParams)
  return Response.json(lookupResponse(await searchProducts(search, offset, limit + 1), limit))
}
