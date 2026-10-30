import "server-only"

import { aliasedTable, and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { products, uomCategories, uoms } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"

const reference = aliasedTable(uoms, "reference_uom")
const LIST_BINDINGS: ListBindings = {
  code: { label: "Kode", type: "text", expression: uoms.code },
  name: { label: "Nama satuan", type: "text", expression: uoms.name },
  factor: { label: "Faktor konversi", type: "number", expression: uoms.factor },
  category: { label: "Kategori", type: "text", expression: uomCategories.name, groupable: true },
  active: { label: "Aktif", type: "boolean", expression: uoms.active, groupable: true },
}
export const UOM_LIST_FIELDS = listFields(LIST_BINDINGS)

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
  rounding: uoms.rounding,
  productId: uoms.productId,
  productSku: products.sku,
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
  rounding: string
  // Satuan khusus produk (R-03); kosong = satuan umum.
  productId: string | null
  productSku: string | null
}

function withCategory(selection = {}) {
  return db
    .select({ ...uomWithCategory, ...selection })
    .from(uoms)
    .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
    .leftJoin(
      reference,
      and(eq(reference.categoryId, uoms.categoryId), eq(reference.isReference, true)),
    )
    .leftJoin(products, eq(products.id, uoms.productId))
}

// Halaman Satuan: cari kode/nama, filter kategori, pagination. Urut per kategori, acuan dulu.
export async function listUoms({
  search,
  categoryId,
  active,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { active?: boolean; categoryId?: string }) {
  const conditions: SQL[] = []
  if (active !== undefined) conditions.push(eq(uoms.active, active))
  if (categoryId) conditions.push(eq(uoms.categoryId, categoryId))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(ilike(uoms.code, pattern), ilike(uoms.name, pattern), ilike(products.sku, pattern))!,
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)

  const [rows, [{ total }]] = await Promise.all([
    withCategory(controls.selection)
      .where(where)
      // Per kategori: acuan dulu, satuan umum dari yang terkecil, lalu satuan khusus produk.
      .orderBy(
        ...controls.order,
        asc(uomCategories.name),
        desc(uoms.isReference),
        sql`${uoms.productId} is not null`,
        asc(uoms.factor),
        asc(uoms.code),
        asc(uoms.id),
      )
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: count() })
      .from(uoms)
      .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
      .leftJoin(products, eq(products.id, uoms.productId))
      .where(where),
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
