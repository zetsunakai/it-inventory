import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LOGIN_PATH } from "@/lib/auth-config"
import { getSession } from "@/server/auth/session"

import { MfaDisable, MfaSetup } from "./mfa-setup"

export const metadata: Metadata = { title: "Keamanan akun · IT Inventory" }

export default function MfaPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verifikasi dua langkah (MFA)</CardTitle>
          <CardDescription>
            Login akan meminta kode dari aplikasi authenticator di ponsel Anda, selain password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
            <MfaStatus />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}

async function MfaStatus() {
  // Sengaja getSession() langsung, bukan requireUser(): status MFA dibaca ulang setelah aktivasi
  // atau penonaktifan di request yang sama, sedangkan requireUser() di-cache per request.
  const session = await getSession()
  if (!session) redirect(LOGIN_PATH)

  if (session.user.twoFactorEnabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm">MFA sudah aktif untuk akun Anda.</p>
        {/* Sengaja <a>, bukan <Link>: muat ulang penuh. Dengan cacheComponents, router menyimpan
            halaman yang dibuka sebelum MFA aktif, dan halaman itu masih mengarah ke sini. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={buttonVariants({ variant: "outline" })}>
          Kembali ke beranda
        </a>
        <MfaDisable />
      </div>
    )
  }

  return <MfaSetup />
}
