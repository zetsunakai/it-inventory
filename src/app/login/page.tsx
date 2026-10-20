import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthLayout } from "./auth-layout"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Masuk · IT Inventory" }

export default function LoginPage() {
  return (
    <AuthLayout title="Masuk" description="Gunakan akun yang dibuat oleh Administrator.">
      {/* LoginForm membaca ?next= dari URL, jadi perlu Suspense. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
