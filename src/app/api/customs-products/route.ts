import type { NextRequest } from "next/server"

import { SEARCH_PARAM } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { getApiUser } from "@/server/auth/session"
import { searchCustomsProducts } from "@/modules/it-inventory/server/queries/customs-documents"

// Produk siap dokumen BC untuk baris barang: GET /api/customs-products?q=kain
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const search = (request.nextUrl.searchParams.get(SEARCH_PARAM) ?? "").trim().slice(0, 100)
  return Response.json({ items: await searchCustomsProducts(search) })
}
