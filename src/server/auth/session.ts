import "server-only"

import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"
import { cache } from "react"

import { LOGIN_PATH, MFA_SETUP_PATH } from "@/lib/auth-config"
import { hasPermission, requiresMfa, type Permission, type Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { userRoles } from "@/server/db/schema"

import { auth } from "."

// Satu-satunya tempat membaca sesi (Data Access Layer).
// Karena membaca request, komponen yang memanggil fungsi di file ini
// harus berada di dalam <Suspense> (Next.js cacheComponents).

export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}

export type CurrentUser = {
  id: string
  name: string
  email: string
  roles: Role[]
  twoFactorEnabled: boolean
}

// cache() supaya sesi dan peran hanya dibaca sekali per request,
// walaupun dipanggil dari banyak komponen.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession()
  if (!session) return null
  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, session.user.id))
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: rows.map((row) => row.role),
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  }
})

// User yang perannya wajib MFA tapi belum mengaktifkannya diarahkan ke
// halaman aktivasi. Hanya halaman aktivasi itu yang boleh melewati aturan ini.
export async function requireUser({ allowMissingMfa = false } = {}) {
  const user = await getCurrentUser()
  if (!user) redirect(LOGIN_PATH)
  if (!allowMissingMfa && requiresMfa(user.roles) && !user.twoFactorEnabled) {
    redirect(MFA_SETUP_PATH)
  }
  return user
}

// Dipakai di halaman, server action, dan route handler.
// User tanpa izin mendapat halaman 403 (src/app/forbidden.tsx).
export async function requirePermission(permission: Permission) {
  const user = await requireUser()
  if (!hasPermission(user.roles, permission)) forbidden()
  return user
}
