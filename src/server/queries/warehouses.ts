import "server-only"

import {
  and,
  asc,
  count,
  eq,
  ilike,
  inArray,
  isNull,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import type { InventoryCategory } from "@/lib/inventory"
import type { ListParams } from "@/lib/list-params"
import { ALL_WAREHOUSE_ROLES, type Role } from "@/lib/permissions"
import { db } from "@/server/db"
import {
  locationPaths,
  locations,
  userRoles,
  users,
  userWarehouses,
  warehouses,
} from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

// Akses gudang selalu lewat fungsi database can_access_warehouse() (migrasi 0013),
// supaya aturannya hanya ada di satu tempat.
function accessibleBy(userId: string) {
  return sql`can_access_warehouse(${userId}, ${warehouses.id})`
}

export type WarehouseRow = typeof warehouses.$inferSelect

// Halaman Gudang: hanya gudang yang boleh dilihat user, dengan jumlah lokasinya.
export async function listWarehouses({
  userId,
  search,
  category,
  pageSize,
  offset,
}: ListParams & { userId: string; category?: InventoryCategory }) {
  const conditions: SQL[] = [accessibleBy(userId)]
  if (category) conditions.push(eq(warehouses.category, category))
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(or(ilike(warehouses.code, pattern), ilike(warehouses.name, pattern))!)
  }
  const where = and(...conditions)

  // Jumlah lokasi per gudang sebagai subquery yang di-join, bukan subquery berkorelasi di
  // select: di sana kolom dirender tanpa nama tabel sehingga membandingkan kolom yang salah.
  const locationCounts = db
    .select({ warehouseId: locations.warehouseId, total: count().as("location_total") })
    .from(locations)
    .groupBy(locations.warehouseId)
    .as("location_counts")

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        warehouse: warehouses,
        locationCount: sql<number>`coalesce(${locationCounts.total}, 0)::int`,
      })
      .from(warehouses)
      .leftJoin(locationCounts, eq(locationCounts.warehouseId, warehouses.id))
      .where(where)
      .orderBy(asc(warehouses.code))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(warehouses).where(where),
  ])
  return {
    rows: rows.map((row) => ({ ...row.warehouse, locationCount: row.locationCount })),
    total,
  }
}

// Gudang yang boleh dilihat user; undefined bila tidak ada atau tidak punya akses.
export async function getWarehouseForUser(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, id), accessibleBy(userId)))
  return row
}

export type LocationRow = typeof locations.$inferSelect & { path: string; depth: number }

const locationWithPath = {
  id: locations.id,
  code: locations.code,
  name: locations.name,
  type: locations.type,
  warehouseId: locations.warehouseId,
  parentId: locations.parentId,
  active: locations.active,
  createdAt: locations.createdAt,
  updatedAt: locations.updatedAt,
  path: locationPaths.path,
  depth: locationPaths.depth,
}

// Lokasi di dalam satu gudang, urut sesuai pohonnya (induk lalu anak-anaknya).
export async function listWarehouseLocations(warehouseId: string): Promise<LocationRow[]> {
  return db
    .select(locationWithPath)
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .where(eq(locations.warehouseId, warehouseId))
    .orderBy(asc(locationPaths.path))
}

// Lokasi virtual (di luar gudang): vendor, customer, scrap, penyesuaian.
export async function listVirtualLocations(): Promise<LocationRow[]> {
  return db
    .select(locationWithPath)
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .where(isNull(locations.warehouseId))
    .orderBy(asc(locationPaths.path))
}

export async function getLocation(id: string): Promise<LocationRow | undefined> {
  const [row] = await db
    .select(locationWithPath)
    .from(locations)
    .innerJoin(locationPaths, eq(locationPaths.id, locations.id))
    .where(eq(locations.id, id))
  return row
}

export type WarehouseUser = { id: string; name: string; email: string; roles: Role[] }

// Nama tabel ditulis lengkap: kolom di dalam sql`` pada select dirender tanpa nama tabel.
const rolesOf = sql<Role[]>`coalesce(
  (select json_agg(ur.role order by ur.role) from ${userRoles} ur where ur.user_id = ${users}.id),
  '[]'
)`

// User yang diberi akses khusus ke gudang ini (di luar peran yang otomatis bisa semua gudang).
export async function listWarehouseUsers(warehouseId: string): Promise<WarehouseUser[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, roles: rolesOf })
    .from(userWarehouses)
    .innerJoin(users, eq(users.id, userWarehouses.userId))
    .where(eq(userWarehouses.warehouseId, warehouseId))
    .orderBy(asc(users.name))
}

// User yang bisa diberi akses: belum punya akses ke gudang ini dan bukan peran semua-gudang.
export async function listAssignableUsers(warehouseId: string): Promise<WarehouseUser[]> {
  return db
    .select({ id: users.id, name: users.name, email: users.email, roles: rolesOf })
    .from(users)
    .where(
      and(
        notExists(
          db
            .select({ one: sql`1` })
            .from(userWarehouses)
            .where(
              and(eq(userWarehouses.userId, users.id), eq(userWarehouses.warehouseId, warehouseId)),
            ),
        ),
        notExists(
          db
            .select({ one: sql`1` })
            .from(userRoles)
            .where(
              and(
                eq(userRoles.userId, users.id),
                inArray(userRoles.role, [...ALL_WAREHOUSE_ROLES]),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(users.name))
}
