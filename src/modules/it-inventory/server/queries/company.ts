import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import type { RefCodeOption } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { company, refCodes } from "@/server/db/schema"

// Profil perusahaan (satu baris), beserta kantor pabean pengawas untuk ditampilkan
// sebagai [kode] nama. null = belum diisi Administrator.
export async function getCompanyProfile() {
  const [row] = await db
    .select({
      profile: company,
      office: { code: refCodes.code, name: refCodes.name, parentCode: refCodes.parentCode },
    })
    .from(company)
    .leftJoin(
      refCodes,
      and(
        eq(refCodes.type, "customs_office"),
        eq(refCodes.code, company.supervisingOfficeCode),
        isNull(refCodes.parentCode),
      ),
    )
  if (!row) return null
  return { ...row.profile, office: row.office as RefCodeOption | null }
}
