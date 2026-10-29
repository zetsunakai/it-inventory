"use client"

import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useActionState, useState } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, type SignInState } from "@/server/auth/actions"

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const next = useSearchParams().get("next") ?? ""
  const [state, formAction, pending] = useActionState<SignInState, FormData>(signIn, {})

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="next" value={next} />
      {/* Ringkasan kesalahan di atas field (skill UI). */}
      <FormErrors errors={state.errors} />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="nama@perusahaan.com"
            autoCapitalize="none"
            spellCheck={false}
            className="pl-9"
            defaultValue={state.email}
            autoFocus
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Masukkan password"
            className="pr-12 pl-9"
            required
          />
          <Button
            type="button"
            variant="inline"
            size="icon-sm"
            className="absolute top-1 right-1 text-muted-foreground"
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={showPassword}
            aria-controls="password"
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>
    </form>
  )
}
