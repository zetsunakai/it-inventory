import type { NextRequest } from "next/server"
import { z } from "zod"

import { hasPermission } from "@/lib/permissions"
import { customsTransferProducts } from "@/modules/it-inventory/server/queries/customs-transfers"
import { getApiUser } from "@/server/auth/session"

const ids = z.array(z.uuid()).min(1).max(200)

// Barang dari transfer yang dipilih, dijumlah per produk (H-04):
// GET /api/customs-documents/transfer-products?ids=<id>,<id>
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const parsed = ids.safeParse((request.nextUrl.searchParams.get("ids") ?? "").split(","))
  if (!parsed.success) {
    return Response.json({ error: "Transfer tidak valid." }, { status: 400 })
  }
  return Response.json({ items: await customsTransferProducts(parsed.data) })
}
