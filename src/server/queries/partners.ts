import "server-only"

import { and, asc, count, eq, ilike, isNull, or, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import type { RefCodeOption } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { partners, refCodes } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

export type PartnerRow = typeof partners.$inferSelect

export type PartnerRole = "vendor" | "customer"

// Halaman Partner: cari kode, nama, nomor identitas, atau NITKU; filter peran.
export async function listPartners({
  search,
  role,
  pageSize,
  offset,
}: ListParams & { role?: PartnerRole }) {
  const conditions: SQL[] = []
  if (role === "vendor") conditions.push(eq(partners.isVendor, true))
  if (role === "customer") conditions.push(eq(partners.isCustomer, true))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(
        ilike(partners.code, pattern),
        ilike(partners.name, pattern),
        ilike(partners.identityNumber, pattern),
        ilike(partners.nitku, pattern),
      )!,
    )
  }
  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(partners)
      .where(where)
      .orderBy(asc(partners.code))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(partners).where(where),
  ])
  return { rows, total }
}

// Partner beserta negaranya untuk ditampilkan sebagai [kode] nama.
export async function getPartner(id: string) {
  const [row] = await db
    .select({
      partner: partners,
      country: { code: refCodes.code, name: refCodes.name, parentCode: refCodes.parentCode },
    })
    .from(partners)
    .leftJoin(
      refCodes,
      and(
        eq(refCodes.type, "country"),
        eq(refCodes.code, partners.countryCode),
        isNull(refCodes.parentCode),
      ),
    )
    .where(eq(partners.id, id))
  if (!row) return undefined
  return { ...row.partner, country: row.country as RefCodeOption | null }
}
