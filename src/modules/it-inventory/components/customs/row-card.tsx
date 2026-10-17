"use client"

import { Trash2 } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"

// Satu baris berulang di form dokumen BC (lampiran, kemasan, barang, dst.): kartu dengan judul,
// tombol hapus, dan isian di grid 12 kolom.
export function RowCard({
  label,
  onRemove,
  children,
}: {
  label: string
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="form-grid rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-control font-medium first-letter:uppercase">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Hapus ${label}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      {children}
    </div>
  )
}
