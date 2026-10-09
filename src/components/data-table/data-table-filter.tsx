"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useTransition } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PAGE_PARAM } from "@/lib/list-params"

// Nilai khusus untuk opsi "Semua", karena Select tidak bisa memilih nilai kosong.
const ALL = "__semua__"

// Filter pilihan tertutup yang menulis ke ?<name>= di URL.
export function DataTableFilter({
  name,
  label,
  options,
}: {
  name: string
  label: string
  options: { value: string; label: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const current = searchParams.get(name)
  const value = options.some((option) => option.value === current) ? current! : ALL
  const items = [{ value: ALL, label: `${label}: semua` }, ...options]

  function handleChange(next: string | null) {
    const params = new URLSearchParams(searchParams)
    if (next && next !== ALL) params.set(name, next)
    else params.delete(name)
    params.delete(PAGE_PARAM)
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
  }

  return (
    <Select items={items} value={value} onValueChange={handleChange}>
      <SelectTrigger aria-label={label} className="w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
