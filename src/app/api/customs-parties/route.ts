import type { NextRequest } from "next/server"
import { z } from "zod"

import { hasPermission } from "@/lib/permissions"
import { getApiUser } from "@/server/auth/session"
import { customsPartyFromPartner } from "@/modules/it-inventory/server/queries/customs-documents"

// Data partner sebagai entitas dokumen BC: GET /api/customs-parties?partner=<id>
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("partner"))
  const party = id.success ? await customsPartyFromPartner(id.data) : null
  if (!party) return Response.json({ error: "Partner tidak ditemukan." }, { status: 404 })
  return Response.json(party)
}
