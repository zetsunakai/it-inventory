import "server-only"

import { eq } from "drizzle-orm"
import { cookies, headers } from "next/headers"
import { forbidden, redirect } from "next/navigation"
import { cache } from "react"

import { LOGIN_PATH } from "@/lib/auth-config"
import { hasPermission, type Permission, type Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { userRoles } from "@/server/db/schema"

import { auth } from "."

// Satu-satunya tempat membaca sesi (Data Access Layer).
// Karena membaca request, komponen yang memanggil fungsi di file ini
// harus berada di dalam <Suspense> (Next.js cacheComponents).

export async function getSession() {
  // Header Cookie dibangun dari cookies(), bukan dari request asli: di server action yang baru
  // mengganti token sesi (login), render lanjutan di request yang sama harus
  // membaca token baru, bukan token lama yang sudah dihapus Better Auth.
  const requestHeaders = new Headers(await headers())
  const cookie = (await cookies())
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ")
  requestHeaders.set("cookie", cookie)
  return auth.api.getSession({ headers: requestHeaders })
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

// MFA bersifat opsional untuk semua peran, jadi tidak ada pengalihan ke halaman aktivasi.
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect(LOGIN_PATH)
  return user
}

// Untuk route handler yang dipanggil dari browser: tanpa redirect, pemanggil membalas 401.
// null = belum login atau sesinya tidak valid.
export async function getApiUser() {
  return getCurrentUser()
}

// Dipakai di halaman, server action, dan route handler.
// User tanpa izin mendapat halaman 403 (src/app/forbidden.tsx).
export async function requirePermission(permission: Permission) {
  const user = await requireUser()
  if (!hasPermission(user.roles, permission)) forbidden()
  return user
}
