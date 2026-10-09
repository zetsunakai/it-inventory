import { asc, eq } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { ROLE_LABELS, type Role } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { userRoles, users } from "@/server/db/schema"

export const metadata: Metadata = { title: "Pengguna · IT Inventory" }

export default function UsersPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pengguna</h1>
        <p className="text-sm text-muted-foreground">Daftar user dan perannya.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
        <UserList />
      </Suspense>
    </main>
  )
}

async function UserList() {
  await requirePermission("user:manage")

  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: userRoles.role })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .orderBy(asc(users.name))

  const byUser = new Map<string, { name: string; email: string; roles: Role[] }>()
  for (const row of rows) {
    const entry = byUser.get(row.id) ?? { name: row.name, email: row.email, roles: [] }
    if (row.role) entry.roles.push(row.role)
    byUser.set(row.id, entry)
  }

  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b text-muted-foreground">
        <tr>
          <th className="py-2 font-medium">Nama</th>
          <th className="py-2 font-medium">Email</th>
          <th className="py-2 font-medium">Peran</th>
        </tr>
      </thead>
      <tbody>
        {[...byUser.entries()].map(([id, user]) => (
          <tr key={id} className="border-b last:border-0">
            <td className="py-2">{user.name}</td>
            <td className="py-2">{user.email}</td>
            <td className="py-2">
              {user.roles.length
                ? user.roles.map((role) => ROLE_LABELS[role]).join(", ")
                : "Belum punya peran"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
