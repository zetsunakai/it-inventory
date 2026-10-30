import "server-only"

import { aliasedTable, and, asc, count, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm"

import type { InventoryCategory } from "@/modules/inventory/lib/inventory"
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS } from "@/modules/inventory/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import type { RefCodeOption } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { products, refCodes, uomCategories, uoms } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"

export type ProductRow = typeof products.$inferSelect & { uomCode: string }
const LIST_BINDINGS: ListBindings = {
  sku: { label: "Product code", type: "text", expression: products.sku },
  name: { label: "Nama produk", type: "text", expression: products.name, groupable: true },
  hsCode: { label: "Kode HS", type: "text", expression: products.hsCode, groupable: true },
  category: {
    label: "Kategori inventory",
    type: "selection",
    expression: products.category,
    groupable: true,
    options: INVENTORY_CATEGORIES.map((value) => ({
      value,
      label: INVENTORY_CATEGORY_LABELS[value],
    })),
  },
  active: {
    label: "Aktif",
    type: "boolean",
    expression: products.active,
    groupable: true,
    options: [
      { value: "true", label: "Aktif" },
      { value: "false", label: "Diarsipkan" },
    ],
  },
  customsReady: {
    label: "Siap dokumen BC",
    type: "boolean",
    expression: products.customsReady,
    groupable: true,
  },
}
export const PRODUCT_LIST_FIELDS = listFields(LIST_BINDINGS)

// Halaman Produk: cari SKU/nama/kode HS, filter kategori dan kesiapan dokumen BC.
export async function listProducts({
  search,
  category,
  customsReady,
  active,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: ListParams & { active?: boolean; category?: InventoryCategory; customsReady?: boolean }) {
  const conditions: SQL[] = []
  if (active !== undefined) conditions.push(eq(products.active, active))
  if (category) conditions.push(eq(products.category, category))
  if (customsReady !== undefined) conditions.push(eq(products.customsReady, customsReady))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(
      or(
        ilike(products.sku, pattern),
        ilike(products.name, pattern),
        ilike(products.hsCode, pattern),
      )!,
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ product: products, uomCode: uoms.code, ...controls.selection })
      .from(products)
      .innerJoin(uoms, eq(uoms.id, products.uomId))
      .where(where)
      .orderBy(...controls.order, asc(products.sku), asc(products.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ])
  return { rows: rows.map(({ product, ...row }) => ({ ...product, ...row })), total }
}

const hs = aliasedTable(refCodes, "hs")

// Produk beserta satuan stok dan referensi kepabeanannya, untuk form ubah.
export async function getProduct(id: string) {
  const [row] = await db
    .select({
      product: products,
      categoryPath: sql<
        string | null
      >`(select path from product_category_paths where id = ${products.categoryId})`,
      // Sama dengan syarat trigger products_tracking_guard.
      trackingLocked: sql<boolean>`(
        exists (select 1 from stock_balances b
          where b.product_id = ${products.id} and b.warehouse_id is not null and b.qty <> 0)
        or exists (
          select 1 from stock_moves m join transfers t on t.id = m.transfer_id
          where m.product_id = ${products.id} and t.status not in ('done', 'cancelled')
        )
      )`,
      uom: { code: uoms.code, name: uoms.name },
      hs: { code: hs.code, name: hs.name, parentCode: hs.parentCode },
    })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .leftJoin(hs, and(eq(hs.type, "hs_code"), eq(hs.code, products.hsCode), isNull(hs.parentCode)))
    .where(eq(products.id, id))
  if (!row) return undefined
  return {
    ...row.product,
    categoryPath: row.categoryPath,
    trackingLocked: row.trackingLocked,
    uom: row.uom,
    hs: row.hs as RefCodeOption | null,
  }
}

export type UomOption = { id: string; code: string; name: string; categoryName: string }

// Satuan aktif untuk pilihan satuan stok.
export async function listActiveUoms(): Promise<UomOption[]> {
  return (
    db
      .select({
        id: uoms.id,
        code: uoms.code,
        name: uoms.name,
        categoryName: uomCategories.name,
      })
      .from(uoms)
      .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
      // Satuan stok selalu satuan umum (satuan khusus produk tidak bisa jadi satuan stok).
      .where(and(eq(uoms.active, true), eq(uomCategories.active, true), isNull(uoms.productId)))
      .orderBy(asc(uomCategories.name), asc(uoms.code))
  )
}
