import type { NextRequest } from "next/server"

import { pickFilter, SEARCH_PARAM } from "@/lib/list-params"
import { REF_CODE_TYPES } from "@/lib/ref-codes"
import { getApiUser } from "@/server/auth/session"
import { searchRefCodes } from "@/server/queries/ref-codes"

// Pencarian referensi kepabeanan untuk komponen pilihan [kode] nama (RefCodeSelect).
//   GET /api/ref-codes?type=customs_office&q=priok[&parent=<kode induk>]
// Semua user yang sudah login boleh mencari; mengubah referensi tetap lewat halaman Administrator.
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })

  const params = Object.fromEntries(request.nextUrl.searchParams)
  const type = pickFilter(params, "type", REF_CODE_TYPES)
  if (!type) return Response.json({ error: "Jenis referensi tidak dikenal." }, { status: 400 })

  const items = await searchRefCodes({
    type,
    search: (params[SEARCH_PARAM] ?? "").trim().slice(0, 100),
    parentCode: params.parent?.trim() || undefined,
  })
  return Response.json({ items })
}
