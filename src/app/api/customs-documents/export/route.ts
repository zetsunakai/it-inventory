import type { NextRequest } from "next/server"

import { parseListParams, pickFilter } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_DOCUMENT_STATUSES,
  CUSTOMS_PERIODS,
} from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import { customsListExport } from "@/modules/it-inventory/server/customs-export"
import {
  customsOfficeOptions,
  listCustomsDocuments,
} from "@/modules/it-inventory/server/queries/customs-documents"
import { getApiUser } from "@/server/auth/session"

export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const raw = Object.fromEntries(request.nextUrl.searchParams)
  const code = pickFilter(raw, "docCode", CUSTOMS_DOC_CODES)
  const spec = code ? CUSTOMS_SPECS[code] : undefined
  const format = raw.format
  if ((raw.docCode && !spec) || (format !== "pdf" && format !== "xlsx")) {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 })
  }
  const offices = await customsOfficeOptions(spec?.code)
  const params = {
    ...parseListParams(raw, { pageSize: 1000 }),
    docCode: spec?.code,
    status: pickFilter(raw, "status", CUSTOMS_DOCUMENT_STATUSES),
    period: pickFilter(raw, "periode", CUSTOMS_PERIODS),
    officeCode: pickFilter(
      raw,
      "kantor",
      offices.map((office) => office.value),
    ),
    offset: 0,
  }
  const first = await listCustomsDocuments(params)
  const rows = first.rows
  for (let offset = params.pageSize; offset < first.total; offset += params.pageSize) {
    const next = await listCustomsDocuments({ ...params, offset })
    rows.push(...next.rows)
  }
  const body = await customsListExport(spec ?? null, rows, format)
  const name = `Daftar-${spec?.title.replace(/\W/g, "") ?? "Dokumen"}.${format}`
  return new Response(Buffer.from(body), {
    headers: {
      "content-type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  })
}
