"use client"

import { CircleAlert } from "lucide-react"
import { useEffect, useRef } from "react"

// Ringkasan semua kesalahan form sekaligus (PRD bagian 7.6). Diletakkan di ATAS form; fokus
// pindah ke sini setelah submit gagal supaya terbaca walau form panjang dan oleh pembaca layar.
export function FormErrors({ errors }: { errors?: string[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors?.length) ref.current?.focus()
  }, [errors])

  if (!errors?.length) return null
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">
          {errors.length === 1
            ? "Periksa isian berikut:"
            : `Periksa ${errors.length} isian berikut:`}
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
