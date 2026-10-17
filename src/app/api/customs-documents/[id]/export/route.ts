import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"
import { z } from "zod"

import { hasPermission } from "@/lib/permissions"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import { customsExportExcel, customsExportPdf } from "@/modules/it-inventory/server/customs-export"
import { getCustomsDocument } from "@/modules/it-inventory/server/queries/customs-documents"
import { getApiUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { customsDocuments } from "@/server/db/schema"

const FORMATS = {
  pdf: { type: "application/pdf", build: customsExportPdf },
  xlsx: {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    build: customsExportExcel,
  },
} as const

// Export draft dokumen BC (M3-13): GET /api/customs-documents/<id>/export?format=pdf|xlsx
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/customs-documents/[id]/export">,
) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const { id } = await params
  const format = request.nextUrl.searchParams.get("format")
  if (!z.uuid().safeParse(id).success || (format !== "pdf" && format !== "xlsx")) {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 })
  }
  const [row] = await db
    .select({ docCode: customsDocuments.docCode })
    .from(customsDocuments)
    .where(eq(customsDocuments.id, id))
  const spec = row ? CUSTOMS_SPECS[row.docCode] : undefined
  const doc = spec ? await getCustomsDocument(spec, id) : null
  if (!spec || !doc) return Response.json({ error: "Dokumen tidak ditemukan." }, { status: 404 })

  const body = await FORMATS[format].build(spec, doc)
  const name = `${spec.title.replace(/\W/g, "")}-${doc.ajuNumber}.${format}`
  return new Response(Buffer.from(body), {
    headers: {
      "content-type": FORMATS[format].type,
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  })
}
