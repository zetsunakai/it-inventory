import { eq } from "drizzle-orm"
import type { NextRequest } from "next/server"

import { hasPermission } from "@/lib/permissions"
import { getApiUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { customsAttachments } from "@/server/db/schema"
import { getStorage } from "@/server/storage"

// Unduh file lampiran dokumen BC (M3-10): GET /api/customs-files?key=<kunci file>.
// Hanya kunci yang tercatat sebagai lampiran yang bisa diunduh.
export async function GET(request: NextRequest) {
  const user = await getApiUser()
  if (!user) return Response.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  if (!hasPermission(user.roles, "bc:read")) {
    return Response.json({ error: "Tidak punya izin." }, { status: 403 })
  }
  const key = request.nextUrl.searchParams.get("key") ?? ""
  const [attachment] = key
    ? await db
        .select({ fileName: customsAttachments.fileName })
        .from(customsAttachments)
        .where(eq(customsAttachments.fileKey, key))
        .limit(1)
    : []
  const file = attachment ? await getStorage().get(key) : null
  if (!attachment || !file) {
    return Response.json({ error: "File tidak ditemukan." }, { status: 404 })
  }
  const name = attachment.fileName ?? "lampiran"
  return new Response(Buffer.from(file.body), {
    headers: {
      "content-type": file.contentType,
      "content-length": String(file.body.byteLength),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  })
}
