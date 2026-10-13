import { ChevronDown, Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

// Tombol export master data (M1-07): pilih Excel atau CSV, file langsung terunduh.
// href = route handler export, mis. /master/produk/export.
export function ExportMenu({ href, label = "Export" }: { href: string; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download />
        {label}
        <ChevronDown data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<a href={`${href}?format=xlsx`} download />}>
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={`${href}?format=csv`} download />}>
          CSV (.csv)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
