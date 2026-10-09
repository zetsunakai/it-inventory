import type { Metadata } from "next"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requiresMfa } from "@/lib/permissions"
import { requireUser } from "@/server/auth/session"

import { MfaSetup } from "./mfa-setup"

export const metadata: Metadata = { title: "Aktivasi MFA · IT Inventory" }

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
  const user = await requireUser({ allowMissingMfa: true })

  if (user.twoFactorEnabled) {
    return (
      <div className="space-y-4">
        <p className="text-sm">MFA sudah aktif untuk akun Anda.</p>
        {/* Sengaja <a>, bukan <Link>: muat ulang penuh. Dengan cacheComponents, router menyimpan
            halaman yang dibuka sebelum MFA aktif, dan halaman itu masih mengarah ke sini. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={buttonVariants({ variant: "outline" })}>
          Kembali ke beranda
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {requiresMfa(user.roles) && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Peran Anda wajib memakai MFA. Aktifkan dulu sebelum bisa membuka halaman lain.
        </p>
      )}
      <MfaSetup />
    </div>
  )
}
