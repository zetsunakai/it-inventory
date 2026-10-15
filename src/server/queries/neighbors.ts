import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/server/db"

// Record sebelum/sesudah untuk tombol di header dokumen master (RU-23), urut kode seperti
// daftarnya. Tabel dan kolom dari daftar tetap, bukan dari input user.
const SOURCES = {
  products: { code: "sku", path: "/master/produk" },
  partners: { code: "code", path: "/master/partner" },
} as const

export async function masterNeighbors(table: keyof typeof SOURCES, code: string) {
  const source = SOURCES[table]
  const name = sql.raw(table)
  const column = sql.raw(source.code)
  const [prev, next] = await Promise.all(
    [
      sql`select id, ${column} as code from ${name} where ${column} < ${code} order by ${column} desc limit 1`,
      sql`select id, ${column} as code from ${name} where ${column} > ${code} order by ${column} asc limit 1`,
    ].map(async (query) => (await db.execute<{ id: string; code: string }>(query)).rows[0]),
  )
  const link = (row?: { id: string; code: string }) =>
    row && { href: `${source.path}/${row.id}`, label: row.code }
  return { prev: link(prev), next: link(next) }
}

export async function warehouseNeighbors(userId: string, code: string) {
  const [prev, next] = await Promise.all([
    db.execute<{ id: string; code: string }>(sql`
      select id, code from warehouses
      where code < ${code} and can_access_warehouse(${userId}, id)
      order by code desc limit 1`),
    db.execute<{ id: string; code: string }>(sql`
      select id, code from warehouses
      where code > ${code} and can_access_warehouse(${userId}, id)
      order by code asc limit 1`),
  ])
  const link = (row?: { id: string; code: string }) =>
    row && { href: `/master/gudang/${row.id}`, label: row.code }
  return { prev: link(prev.rows[0]), next: link(next.rows[0]) }
}

export async function productCategoryNeighbors(path: string) {
  const [prev, next] = await Promise.all([
    db.execute<{ id: string; path: string }>(sql`
      select c.id, p.path from product_categories c
      join product_category_paths p on p.id = c.id
      where p.path < ${path} order by p.path desc limit 1`),
    db.execute<{ id: string; path: string }>(sql`
      select c.id, p.path from product_categories c
      join product_category_paths p on p.id = c.id
      where p.path > ${path} order by p.path asc limit 1`),
  ])
  const link = (row?: { id: string; path: string }) =>
    row && { href: `/master/kategori-produk/${row.id}`, label: row.path }
  return { prev: link(prev.rows[0]), next: link(next.rows[0]) }
}

export async function refCodeNeighbors(type: string, code: string, parentCode: string | null) {
  const [prev, next] = await Promise.all([
    db.execute<{ id: string; code: string }>(sql`
      select id, code from ref_codes
      where type = ${type} and parent_code is not distinct from ${parentCode} and code < ${code}
      order by code desc limit 1`),
    db.execute<{ id: string; code: string }>(sql`
      select id, code from ref_codes
      where type = ${type} and parent_code is not distinct from ${parentCode} and code > ${code}
      order by code asc limit 1`),
  ])
  const link = (row?: { id: string; code: string }) =>
    row && { href: `/master/referensi/${row.id}`, label: row.code }
  return { prev: link(prev.rows[0]), next: link(next.rows[0]) }
}

export async function uomNeighbors(categoryId: string, id: string) {
  const result = await db.execute<{ id: string; code: string }>(sql`
    select id, code from uoms where category_id = ${categoryId}
    order by is_reference desc, (product_id is not null), factor asc, code asc, id asc`)
  const rows = result.rows
  const index = rows.findIndex((row) => row.id === id)
  const link = (row?: { id: string; code: string }) =>
    row && { href: `/master/satuan/${row.id}`, label: row.code }
  return {
    prev: link(index > 0 ? rows[index - 1] : undefined),
    next: link(index >= 0 ? rows[index + 1] : undefined),
  }
}

export async function locationNeighbors(warehouseId: string, path: string) {
  const [prev, next] = await Promise.all([
    db.execute<{ id: string; path: string }>(sql`
      select l.id, p.path from locations l join location_paths p on p.id = l.id
      where l.warehouse_id = ${warehouseId} and p.path < ${path}
      order by p.path desc limit 1`),
    db.execute<{ id: string; path: string }>(sql`
      select l.id, p.path from locations l join location_paths p on p.id = l.id
      where l.warehouse_id = ${warehouseId} and p.path > ${path}
      order by p.path asc limit 1`),
  ])
  const link = (row?: { id: string; path: string }) =>
    row && { href: `/master/gudang/${warehouseId}/lokasi/${row.id}`, label: row.path }
  return { prev: link(prev.rows[0]), next: link(next.rows[0]) }
}
