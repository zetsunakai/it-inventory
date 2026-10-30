import "server-only"

import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"

import type { ListParams } from "@/lib/list-params"
import type { RefCodeOption, RefCodeType } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { refCodes } from "@/server/db/schema"
import { containsPattern, prefixPattern } from "@/server/db/sql-helpers"

export type RefCodeRow = typeof refCodes.$inferSelect
const LIST_BINDINGS: ListBindings = {
  code: { label: "Kode", type: "text", expression: refCodes.code },
  name: { label: "Nama", type: "text", expression: refCodes.name },
  parent: { label: "Kode induk", type: "text", expression: refCodes.parentCode, groupable: true },
  active: {
    label: "Aktif",
    type: "boolean",
    expression: refCodes.active,
    groupable: true,
    options: [
      { value: "true", label: "Aktif" },
      { value: "false", label: "Diarsipkan" },
    ],
  },
}
export const REF_LIST_FIELDS = listFields(LIST_BINDINGS)

// Halaman Referensi kepabeanan: cari kode/nama, filter jenis, pagination.
export async function listRefCodes({
  search,
  type,
  active,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { active?: boolean; type?: RefCodeType }) {
  const conditions: SQL[] = []
  if (active !== undefined) conditions.push(eq(refCodes.active, active))
  if (type) conditions.push(eq(refCodes.type, type))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(or(ilike(refCodes.code, pattern), ilike(refCodes.name, pattern))!)
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...getTableColumns(refCodes), ...controls.selection })
      .from(refCodes)
      .where(where)
      // Urutan jenis mengikuti urutan enum (sama dengan REF_CODE_TYPES).
      .orderBy(
        ...controls.order,
        asc(refCodes.type),
        asc(refCodes.parentCode),
        asc(refCodes.code),
        asc(refCodes.id),
      )
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(refCodes).where(where),
  ])
  return { rows, total }
}

export const REF_CODE_SEARCH_LIMIT = 20

// Pencarian untuk komponen pilihan [kode] nama. Hanya referensi aktif (yang diarsipkan
// tidak boleh dipilih untuk data baru). Kode yang sama persis tampil paling atas,
// lalu kode yang diawali kata kunci, lalu sisanya urut kode.
export async function searchRefCodes({
  type,
  search,
  parentCode,
  codes,
  offset = 0,
  limit = REF_CODE_SEARCH_LIMIT,
}: {
  type: RefCodeType
  search: string
  parentCode?: string
  codes?: string[]
  offset?: number
  limit?: number
}): Promise<RefCodeOption[]> {
  const conditions: SQL[] = [eq(refCodes.type, type), eq(refCodes.active, true)]
  if (parentCode) conditions.push(eq(refCodes.parentCode, parentCode))
  if (codes?.length) conditions.push(inArray(refCodes.code, codes))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(or(ilike(refCodes.code, pattern), ilike(refCodes.name, pattern))!)
  }

  return db
    .select({
      id: refCodes.id,
      code: refCodes.code,
      name: refCodes.name,
      parentCode: refCodes.parentCode,
    })
    .from(refCodes)
    .where(and(...conditions))
    .orderBy(
      desc(sql`lower(${refCodes.code}) = lower(${search})`),
      desc(sql`${refCodes.code} ilike ${prefixPattern(search)}`),
      asc(refCodes.code),
      asc(refCodes.id),
    )
    .limit(limit)
    .offset(offset)
}

export async function getRefCode(id: string) {
  const [row] = await db.select().from(refCodes).where(eq(refCodes.id, id))
  return row
}

export async function findRefCode(type: RefCodeType, code: string, parentCode?: string | null) {
  const [row] = await db
    .select()
    .from(refCodes)
    .where(
      and(
        eq(refCodes.type, type),
        eq(refCodes.code, code),
        parentCode ? eq(refCodes.parentCode, parentCode) : sql`${refCodes.parentCode} is null`,
      ),
    )
  return row
}
