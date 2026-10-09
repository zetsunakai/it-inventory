import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"

// Satu field form: label, kontrol, petunjuk, dan pesan error dari validasi server.
// hint hanya untuk aturan yang tidak tertebak (format NITKU, arti faktor), bukan "boleh dikosongkan".
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
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {errors?.map((message) => (
        <p key={message} className="text-xs font-medium text-destructive">
          {message}
        </p>
      ))}
    </div>
  )
}

// Nilai yang tidak bisa diubah (kode, SKU, satuan stok): tampil sebagai teks beserta alasannya,
// bukan input abu-abu yang di-disable.
export function StaticField({
  label,
  value,
  reason,
  mono,
}: {
  label: string
  value: ReactNode
  reason?: string
  mono?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm leading-none font-medium">{label}</p>
      <p className={mono ? "py-1.5 font-mono text-sm" : "py-1.5 text-sm"}>{value}</p>
      {reason && <p className="text-xs text-muted-foreground">{reason}</p>}
    </div>
  )
}

// Kelompok field dengan judul (mis. "Data produk", "Data kepabeanan").
export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <fieldset className="space-y-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </fieldset>
  )
}
