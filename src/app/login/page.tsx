import type { Metadata } from "next"
import { Suspense } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Masuk · IT Inventory" }

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Masuk ke IT Inventory</CardTitle>
          <CardDescription>Gunakan akun yang dibuat oleh Administrator.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* LoginForm membaca ?next= dari URL, jadi perlu Suspense. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}
