import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

// Satu field form: label, kontrol, petunjuk, dan pesan error dari validasi server.
export function FormField({
  label,
  htmlFor,
  errors,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  errors?: string[]
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors?.map((message) => (
        <p key={message} className="text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  )
}
