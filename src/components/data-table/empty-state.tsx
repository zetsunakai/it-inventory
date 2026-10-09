import { Plus } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { hasActiveFilters, type RawSearchParams } from "@/lib/list-params"

import type { DataTableEmpty } from "./data-table"

// State kosong halaman daftar: bedakan "tidak ada hasil untuk filter ini" (tawarkan hapus filter)
// dari "belum ada data" (tawarkan aksi pertama bila user boleh menambah).
export function listEmptyState({
  searchParams,
  basePath,
  noun,
  create,
}: {
  searchParams: RawSearchParams
  basePath: string
  // Kata benda jamak, mis. "produk", "gudang".
  noun: string
  create?: { href: string; label: string }
}): DataTableEmpty {
  if (hasActiveFilters(searchParams)) {
    return {
      title: `Tidak ada ${noun} yang cocok dengan pencarian atau filter ini.`,
      action: (
        <Link href={basePath} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Hapus pencarian dan filter
        </Link>
      ),
    }
  }
  return {
    title: `Belum ada ${noun}.`,
    action: create && (
      <Link href={create.href} className={buttonVariants({ size: "sm" })}>
        <Plus />
        {create.label}
      </Link>
    ),
  }
}
