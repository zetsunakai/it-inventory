"use client"

import { SearchIcon } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"

import { Input } from "@/components/ui/input"
import { PAGE_PARAM, SEARCH_PARAM } from "@/lib/list-params"

const DEBOUNCE_MS = 300

// Kotak pencarian yang menulis ke ?q= di URL. Server membaca URL itu dan
// memuat ulang data; halaman kembali ke 1 setiap kata kunci berubah.
export function DataTableSearch({ placeholder = "Cari…" }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function handleChange(value: string) {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams)
      const search = value.trim()
      if (search) params.set(SEARCH_PARAM, search)
      else params.delete(SEARCH_PARAM)
      params.delete(PAGE_PARAM)
      const query = params.toString()
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
    }, DEBOUNCE_MS)
  }

  return (
    <div className="relative w-full sm:max-w-xs">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        defaultValue={searchParams.get(SEARCH_PARAM) ?? ""}
        onChange={(event) => handleChange(event.target.value)}
        aria-busy={pending}
        className="pl-8"
      />
    </div>
  )
}
