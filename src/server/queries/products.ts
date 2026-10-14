import "server-only"

import { aliasedTable, and, asc, count, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm"

import type { InventoryCategory } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import type { RefCodeOption } from "@/lib/ref-codes"
import { db } from "@/server/db"
import { products, refCodes, uomCategories, uoms } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

export type ProductRow = typeof products.$inferSelect & { uomCode: string }

// Halaman Produk: cari SKU/nama/kode HS, filter kategori dan kesiapan dokumen BC.
export async function listProducts({
  search,
  category,
  customsReady,
  active,
  pageSize,
  offset,
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
  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ product: products, uomCode: uoms.code })
      .from(products)
      .innerJoin(uoms, eq(uoms.id, products.uomId))
      .where(where)
      .orderBy(asc(products.sku))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ])
  return { rows: rows.map((row) => ({ ...row.product, uomCode: row.uomCode })), total }
}

const hs = aliasedTable(refCodes, "hs")
const ceisaUnit = aliasedTable(refCodes, "ceisa_unit")

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
          where m.product_id = ${products.id} and t.status in ('draft', 'ready')
        )
      )`,
      uom: { code: uoms.code, name: uoms.name },
      hs: { code: hs.code, name: hs.name, parentCode: hs.parentCode },
      ceisaUnit: { code: ceisaUnit.code, name: ceisaUnit.name, parentCode: ceisaUnit.parentCode },
    })
    .from(products)
    .innerJoin(uoms, eq(uoms.id, products.uomId))
    .leftJoin(hs, and(eq(hs.type, "hs_code"), eq(hs.code, products.hsCode), isNull(hs.parentCode)))
    .leftJoin(
      ceisaUnit,
      and(
        eq(ceisaUnit.type, "ceisa_unit"),
        eq(ceisaUnit.code, products.ceisaUnitCode),
        isNull(ceisaUnit.parentCode),
      ),
    )
    .where(eq(products.id, id))
  if (!row) return undefined
  return {
    ...row.product,
    categoryPath: row.categoryPath,
    trackingLocked: row.trackingLocked,
    uom: row.uom,
    hs: row.hs as RefCodeOption | null,
    ceisaUnit: row.ceisaUnit as RefCodeOption | null,
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
