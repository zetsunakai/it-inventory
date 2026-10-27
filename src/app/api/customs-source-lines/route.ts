import type { NextRequest } from "next/server"

import { lookupPage, lookupResponse } from "@/lib/lookup-page"
import { SEARCH_PARAM } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SOURCE_DOC_CODES } from "@/modules/it-inventory/lib/customs-specs"
import { searchCustomsSourceLines } from "@/modules/it-inventory/server/queries/customs-documents"
import { getApiUser } from "@/server/auth/session"

// Lookup source product rows allowed by the target BC's Equip3 domain.
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }

  const target = request.nextUrl.searchParams.get("target")
  if (!target || !CUSTOMS_DOC_CODES.includes(target as (typeof CUSTOMS_DOC_CODES)[number])) {
    return Response.json({ error: "Jenis dokumen target tidak dikenal." }, { status: 400 })
  }
  const sourceCodes = CUSTOMS_SOURCE_DOC_CODES[target as keyof typeof CUSTOMS_SOURCE_DOC_CODES]
  if (!sourceCodes?.length) return Response.json({ items: [], hasMore: false })

  const search = (request.nextUrl.searchParams.get(SEARCH_PARAM) ?? "").trim().slice(0, 100)
  const { offset, limit } = lookupPage(request.nextUrl.searchParams)
  const items = await searchCustomsSourceLines(sourceCodes, search, offset, limit + 1)
  return Response.json(lookupResponse(items, limit))
}
