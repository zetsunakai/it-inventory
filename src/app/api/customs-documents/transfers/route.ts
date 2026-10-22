import type { NextRequest } from "next/server"

import { lookupPage, lookupResponse } from "@/lib/lookup-page"
import { SEARCH_PARAM } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_SOURCE_TYPES,
  type CustomsDocCode,
  type CustomsSourceType,
} from "@/modules/it-inventory/lib/customs"
import { searchCustomsTransfers } from "@/modules/it-inventory/server/queries/customs-transfers"
import { getApiUser } from "@/server/auth/session"

// Pilihan Inventory Transfer Documents di form dokumen BC (H-04):
// GET /api/customs-documents/transfers?docCode=23&source=gr&q=RCV
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const params = request.nextUrl.searchParams
  const docCode = params.get("docCode") ?? ""
  const source = params.get("source") ?? ""
  if (!CUSTOMS_DOC_CODES.includes(docCode as CustomsDocCode) || !(source in CUSTOMS_SOURCE_TYPES)) {
    return Response.json({ error: "Jenis dokumen atau sumber tidak valid." }, { status: 400 })
  }
  const search = (params.get(SEARCH_PARAM) ?? "").trim().slice(0, 100)
  const { offset, limit } = lookupPage(params)
  const rows = await searchCustomsTransfers({
    docCode: docCode as CustomsDocCode,
    source: source as CustomsSourceType,
    search,
    offset,
    limit: limit + 1,
  })
  return Response.json(lookupResponse(rows, limit))
}
