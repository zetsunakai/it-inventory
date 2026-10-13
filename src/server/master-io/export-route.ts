import "server-only"

import type { NextRequest } from "next/server"

import { pickFilter } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { getApiUser, type CurrentUser } from "@/server/auth/session"
import {
  SPREADSHEET_FORMATS,
  spreadsheetResponse,
  type SpreadsheetFormat,
} from "@/server/spreadsheet"

// Route handler unduhan export master data (backlog M1-07):
//   GET /master/produk/export?format=xlsx|csv
// Semua peran yang boleh melihat master data boleh meng-export-nya (termasuk Auditor).
export function exportRoute(
  fileName: string,
  build: (format: SpreadsheetFormat, user: CurrentUser) => Promise<Uint8Array>,
) {
  return async function GET(request: NextRequest) {
    const user = await getApiUser()
    if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
    if (!hasPermission(user.roles, "master:read")) {
      return Response.json({ error: "Anda tidak punya izin." }, { status: 403 })
    }
    const params = Object.fromEntries(request.nextUrl.searchParams)
    const format = pickFilter(params, "format", SPREADSHEET_FORMATS) ?? "xlsx"
    return spreadsheetResponse(format, fileName, await build(format, user))
  }
}
