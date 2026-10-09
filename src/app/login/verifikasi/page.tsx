import type { Metadata } from "next"
import { Suspense } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { VerifyForm } from "./verify-form"

export const metadata: Metadata = { title: "Verifikasi · IT Inventory" }

export default function VerifyPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verifikasi dua langkah</CardTitle>
          <CardDescription>
            Masukkan kode 6 digit dari aplikasi authenticator di ponsel Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <VerifyForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}
