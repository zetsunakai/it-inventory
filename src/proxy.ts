import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

import { AUTH_COOKIE_PREFIX, LOGIN_PATH } from "@/lib/auth-config"

// Pengecekan cepat: hanya melihat apakah cookie sesi ada, tidak memvalidasinya.
// Validasi sesungguhnya tetap di server lewat requireUser() di setiap halaman.
export function proxy(request: NextRequest) {
  const hasSession = getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })
  if (hasSession) return NextResponse.next()

  // API dipanggil lewat fetch, jadi balas 401 alih-alih redirect ke halaman login.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sesi tidak valid. Silakan login." }, { status: 401 })
  }

  const loginUrl = new URL(LOGIN_PATH, request.url)
  const target = request.nextUrl.pathname + request.nextUrl.search
  if (target !== "/") loginUrl.searchParams.set("next", target)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Semua halaman kecuali halaman login, endpoint auth, dan aset statis.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
}
