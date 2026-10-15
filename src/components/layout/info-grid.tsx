import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type InfoItem = {
  label: string
  value: ReactNode
  // Teks panjang (catatan, alasan): lebar penuh.
  wide?: boolean
}

// Ringkasan data dokumen atau master (backlog UF-03): label di atas nilai, tiga kolom di desktop,
// dua di tablet, satu di HP. Menggantikan daftar label–nilai dua kolom yang memanjang ke bawah.
export function InfoGrid({ items, className }: { items: InfoItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("min-w-0 space-y-1", item.wide && "sm:col-span-2 lg:col-span-3")}
        >
          <dt className="text-caption text-muted-foreground">{item.label}</dt>
          <dd className="text-control break-words whitespace-pre-line">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
