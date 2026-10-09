import "server-only"

import { and, asc, count, eq, exists, ilike, or, sql, type SQL } from "drizzle-orm"

import type { ListParams } from "@/lib/list-params"
import type { Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { userRoles, users } from "@/server/db/schema"
import { containsPattern } from "@/server/db/sql-helpers"

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
export async function listUsers({ search, role, pageSize, offset }: UserListFilters) {
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
  const where = and(...conditions)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
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
      .orderBy(asc(users.name), asc(users.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ])

  return { rows: rows as UserListRow[], total }
}
