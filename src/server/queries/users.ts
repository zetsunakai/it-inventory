import "server-only"

import { and, asc, count, eq, exists, ilike, notExists, or, sql, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import type { Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { userRoles, users, userWarehouses, warehouses } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"
import { listControls, listFields, type ListBindings } from "@/server/db/list-controls"
const LIST_BINDINGS: ListBindings = {
  name: { label: "Nama", type: "text", expression: users.name, groupable: true },
  email: { label: "Email", type: "text", expression: users.email },
  mfa: {
    label: "MFA aktif",
    type: "boolean",
    expression: users.twoFactorEnabled,
    groupable: true,
    options: [
      { value: "true", label: "Aktif" },
      { value: "false", label: "Tidak aktif" },
    ],
  },
  created: {
    label: "Tanggal dibuat",
    type: "date",
    expression: sql`(${users.createdAt} at time zone 'Asia/Jakarta')::date`,
    groupable: true,
  },
}
export const USER_LIST_FIELDS = listFields(LIST_BINDINGS)

export type UserListFilters = ListParams & { role?: Role }

export type UserListRow = {
  id: string
  name: string
  email: string
  roles: Role[]
  twoFactorEnabled: boolean
  createdAt: Date
}

// Daftar user untuk halaman Pengguna: cari nama/email, filter peran, pagination.
export async function listUsers({
  search,
  role,
  pageSize,
  offset,
  customFilter,
  groupBy,
}: UserListFilters) {
  const conditions: SQL[] = []
  if (search) {
    const pattern = containsPattern(search)
    conditions.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!)
  }
  if (role) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(userRoles)
          .where(and(eq(userRoles.userId, users.id), eq(userRoles.role, role))),
      ),
    )
  }
  const controls = listControls({ customFilter, groupBy }, LIST_BINDINGS)
  const where = and(...conditions, controls.where)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        ...controls.selection,
        name: users.name,
        email: users.email,
        // json_agg, bukan array_agg: driver pg tidak mengurai array dari tipe enum.
        roles: sql<Role[]>`coalesce(
          json_agg(${userRoles.role} order by ${userRoles.role}) filter (where ${userRoles.role} is not null),
          '[]'
        )`,
        twoFactorEnabled: users.twoFactorEnabled,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(...controls.order, asc(users.name), asc(users.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ])

  return { rows: rows as UserListRow[], total }
}

const rolesOf = sql<Role[]>`coalesce(
  (select json_agg(ur.role order by ur.role) from ${userRoles} ur where ur.user_id = ${users}.id),
  '[]'
)`

// Satu user untuk halaman detail Pengguna (RM-02).
export async function getUser(id: string) {
  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      roles: rolesOf,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
  return row as UserListRow | undefined
}

export type UserWarehouse = { id: string; code: string; name: string; active: boolean }

// Gudang yang diberikan khusus ke user ini (PRD bagian 3; diatur dari halaman Pengguna sejak RM-02).
export async function listUserWarehouses(userId: string): Promise<UserWarehouse[]> {
  return db
    .select({
      id: warehouses.id,
      code: warehouses.code,
      name: warehouses.name,
      active: warehouses.active,
    })
    .from(userWarehouses)
    .innerJoin(warehouses, eq(warehouses.id, userWarehouses.warehouseId))
    .where(eq(userWarehouses.userId, userId))
    .orderBy(asc(warehouses.code))
}

// Gudang aktif yang belum diberikan ke user ini.
export async function listGrantableWarehouses(userId: string): Promise<UserWarehouse[]> {
  return db
    .select({
      id: warehouses.id,
      code: warehouses.code,
      name: warehouses.name,
      active: warehouses.active,
    })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.active, true),
        notExists(
          db
            .select({ one: sql`1` })
            .from(userWarehouses)
            .where(
              and(eq(userWarehouses.warehouseId, warehouses.id), eq(userWarehouses.userId, userId)),
            ),
        ),
      ),
    )
    .orderBy(asc(warehouses.code))
}
