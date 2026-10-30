import "server-only"

import { and, asc, count, eq, getTableColumns, ilike, isNull, or, type SQL } from "drizzle-orm"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"

import type { ListParams } from "@/lib/list-params"
import type { RefCodeOption } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { partners, refCodes } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

export type PartnerRow = typeof partners.$inferSelect
const LIST_BINDINGS: ListBindings = {
  name: { label: "Nama", type: "text", expression: partners.name, groupable: true },
  identityNumber: { label: "NPWP / identitas", type: "text", expression: partners.identityNumber },
  nitku: { label: "NITKU", type: "text", expression: partners.nitku },
  country: { label: "Negara", type: "text", expression: partners.countryCode, groupable: true },
  active: {
    label: "Aktif",
    type: "boolean",
    expression: partners.active,
    groupable: true,
    options: [
      { value: "true", label: "Aktif" },
      { value: "false", label: "Diarsipkan" },
    ],
  },
}
export const PARTNER_LIST_FIELDS = listFields(LIST_BINDINGS)

// Halaman Partner: cari nama, NPWP (nomor identitas), atau NITKU.
export async function listPartners({
  search,
  active,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { active?: boolean }) {
  const conditions: SQL[] = []
  if (active !== undefined) conditions.push(eq(partners.active, active))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(
        ilike(partners.name, pattern),
        ilike(partners.identityNumber, pattern),
        ilike(partners.nitku, pattern),
      )!,
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...getTableColumns(partners), ...controls.selection })
      .from(partners)
      .where(where)
      .orderBy(...controls.order, asc(partners.name), asc(partners.code), asc(partners.id))
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
