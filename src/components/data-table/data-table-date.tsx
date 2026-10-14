"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useId, useTransition } from "react"

import { Input } from "@/components/ui/input"
import { PAGE_PARAM } from "@/lib/list-params"

// Filter tanggal yang menulis ke ?<name>=YYYY-MM-DD di URL, dengan label yang terlihat.
// fallback = tanggal yang dipakai server bila parameter kosong (mis. awal bulan berjalan).
export function DataTableDate({
  name,
  label,
  max,
  fallback,
}: {
  name: string
  label: string
  max?: string
  fallback?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const id = useId()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm whitespace-nowrap text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="date"
        max={max}
        defaultValue={searchParams.get(name) ?? fallback ?? ""}
        className="w-full sm:w-40"
        onChange={(event) => {
          const params = new URLSearchParams(searchParams)
          if (event.target.value) params.set(name, event.target.value)
          else params.delete(name)
          params.delete(PAGE_PARAM)
          const query = params.toString()
          startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
        }}
      />
    </div>
  )
}
