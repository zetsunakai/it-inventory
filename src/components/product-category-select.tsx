"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProductCategoryOption } from "@/server/queries/product-categories"

// Pilihan kategori produk bertingkat (backlog R-01), ditampilkan dengan jalur lengkapnya.
// Pilihan pertama (nilai kosong) berarti tanpa kategori/induk.
export function ProductCategorySelect({
  id,
  name,
  options,
  value,
  onValueChange,
  emptyLabel,
}: {
  id: string
  name: string
  options: ProductCategoryOption[]
  value: string
  onValueChange: (value: string) => void
  emptyLabel: string
}) {
  const items = [
    { value: "", label: emptyLabel },
    ...options.map((option) => ({ value: option.id, label: option.path })),
  ]
  return (
    <Select
      name={name}
      items={items}
      value={value}
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
    >
      <SelectTrigger id={id} className="w-full">
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
