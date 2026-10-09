"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LOGIN_PATH } from "@/lib/auth-config"
import { verifyLoginCode, type CodeState } from "@/server/auth/actions"

export function VerifyForm() {
  const next = useSearchParams().get("next") ?? ""
  const [state, formAction, pending] = useActionState<CodeState, FormData>(verifyLoginCode, {})

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <Label htmlFor="code">Kode autentikasi</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          autoFocus
          required
        />
      </div>
      <FormErrors errors={state.errors} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Memeriksa…" : "Verifikasi"}
      </Button>
      <p className="text-center text-sm">
        <Link href={LOGIN_PATH} className="text-muted-foreground underline underline-offset-4">
          Kembali ke login
        </Link>
      </p>
    </form>
  )
}
