import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthLayout } from "../auth-layout"
import { VerifyForm } from "./verify-form"

export const metadata: Metadata = { title: "Verifikasi · IT Inventory" }

export default function VerifyPage() {
  return (
    <AuthLayout
      title="Verifikasi dua langkah"
      description="Masukkan kode 6 digit dari aplikasi authenticator di ponsel Anda."
      visual="mfa"
    >
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthLayout>
  )
}
