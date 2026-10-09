import "server-only"

import { aliasedTable, and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { uomCategories, uoms } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

const reference = aliasedTable(uoms, "reference_uom")

// Kolom satuan beserta kategori dan satuan acuannya, untuk menampilkan "1 TON = 1.000 KG".
const uomWithCategory = {
  id: uoms.id,
  code: uoms.code,
  name: uoms.name,
  factor: uoms.factor,
  isReference: uoms.isReference,
  active: uoms.active,
  categoryId: uoms.categoryId,
  categoryCode: uomCategories.code,
  categoryName: uomCategories.name,
  referenceCode: reference.code,
}

export type UomRow = {
  id: string
  code: string
  name: string
  factor: string
  isReference: boolean
  active: boolean
  categoryId: string
  categoryCode: string
  categoryName: string
  referenceCode: string | null
}

function withCategory() {
  return db
    .select(uomWithCategory)
    .from(uoms)
    .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
    .leftJoin(
      reference,
      and(eq(reference.categoryId, uoms.categoryId), eq(reference.isReference, true)),
    )
}

// Halaman Satuan: cari kode/nama, filter kategori, pagination. Urut per kategori, acuan dulu.
export async function listUoms({
  search,
  categoryId,
  pageSize,
  offset,
}: ListParams & { categoryId?: string }) {
  const conditions: SQL[] = []
  if (categoryId) conditions.push(eq(uoms.categoryId, categoryId))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(or(ilike(uoms.code, pattern), ilike(uoms.name, pattern))!)
  }
  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    withCategory()
      .where(where)
      // Per kategori: acuan dulu, lalu dari satuan terkecil.
      .orderBy(asc(uomCategories.name), desc(uoms.isReference), asc(uoms.factor), asc(uoms.code))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(uoms).where(where),
  ])
  return { rows, total }
}

export async function getUom(id: string): Promise<UomRow | undefined> {
  const [row] = await withCategory().where(eq(uoms.id, id))
  return row
}

export async function listUomCategories() {
  return db
    .select({
      id: uomCategories.id,
      code: uomCategories.code,
      name: uomCategories.name,
      active: uomCategories.active,
      referenceCode: reference.code,
      referenceName: reference.name,
      uomCount: count(uoms.id),
    })
    .from(uomCategories)
    .leftJoin(
      reference,
      and(eq(reference.categoryId, uomCategories.id), eq(reference.isReference, true)),
    )
    .leftJoin(uoms, eq(uoms.categoryId, uomCategories.id))
    .groupBy(uomCategories.id, reference.code, reference.name)
    .orderBy(asc(uomCategories.name))
}
