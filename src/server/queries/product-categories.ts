import "server-only"

import { sql, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

// Kategori produk bertingkat (backlog R-01). Jalur lengkap ("Bahan baku / Logam") dari view
// product_category_paths; daftar diurutkan per jalur supaya sub-kategori tampil di bawah induknya.

export type ProductCategoryRow = {
  id: string
  name: string
  path: string
  depth: number
  parentId: string | null
  codePrefix: string | null
  codeDigits: number
  active: boolean
  productCount: number
  childCount: number
}

const columns = sql`
  c.id, c.name, p.path, p.depth, c.parent_id, c.code_prefix, c.code_digits, c.active,
  (select count(*)::int from products where category_id = c.id) as product_count,
  (select count(*)::int from product_categories where parent_id = c.id) as child_count`

type RawRow = {
  id: string
  name: string
  path: string
  depth: number
  parent_id: string | null
  code_prefix: string | null
  code_digits: number
  active: boolean
  product_count: number
  child_count: number
}

function toRow(row: RawRow): ProductCategoryRow {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    depth: row.depth,
    parentId: row.parent_id,
    codePrefix: row.code_prefix,
    codeDigits: row.code_digits,
    active: row.active,
    productCount: row.product_count,
    childCount: row.child_count,
  }
}

export async function listProductCategories({
  search,
  active,
  pageSize,
  offset,
}: ListParams & { active?: boolean }) {
  const conditions: SQL[] = [sql`true`]
  if (active !== undefined) conditions.push(sql`c.active = ${active}`)
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(sql`(p.path ilike ${pattern} or c.code_prefix ilike ${pattern})`)
  }
  const from = sql`
    from product_categories c
    join product_category_paths p on p.id = c.id
    where ${sql.join(conditions, sql` and `)}`

  const [rows, totals] = await Promise.all([
    db.execute<RawRow>(sql`select ${columns} ${from} order by p.path limit ${pageSize} offset ${offset}`),
    db.execute<{ total: number }>(sql`select count(*)::int as total ${from}`),
  ])
  return { rows: rows.rows.map(toRow), total: totals.rows[0]?.total ?? 0 }
}

export async function getProductCategory(id: string) {
  const result = await db.execute<RawRow>(sql`
    select ${columns}
    from product_categories c join product_category_paths p on p.id = c.id
    where c.id = ${id}`)
  const row = result.rows[0]
  return row ? toRow(row) : undefined
}

export type ProductCategoryOption = {
  id: string
  path: string
  codePrefix: string | null
  codeDigits: number
}

// Pilihan kategori untuk form produk dan pilihan induk: hanya yang aktif, ditambah kategori yang
// sedang tersimpan (includeId) walaupun sudah diarsipkan.
export async function listProductCategoryOptions(includeId?: string | null) {
  const result = await db.execute<{
    id: string
    path: string
    code_prefix: string | null
    code_digits: number
  }>(sql`
    select c.id, p.path, c.code_prefix, c.code_digits
    from product_categories c join product_category_paths p on p.id = c.id
    where c.active or c.id = ${includeId ?? null}
    order by p.path`)
  return result.rows.map(
    (row): ProductCategoryOption => ({
      id: row.id,
      path: row.path,
      codePrefix: row.code_prefix,
      codeDigits: row.code_digits,
    }),
  )
}
