import { hasActiveFilters, type RawSearchParams } from "@/lib/list-params"

import type { DataTableEmpty } from "./data-table"

// Daftar kosong di halaman daftar mengikuti list view hmx: tanpa pesan dan tombol di tengah tabel,
// tabel tetap setinggi 5 baris (baris pengisi). Aksi Buat ada di toolbar; filter dihapus lewat chip
// pencarian. Pesannya tetap dibacakan pembaca layar.
export function listEmptyState({
  searchParams,
  noun,
}: {
  searchParams: RawSearchParams
  // Kata benda jamak, mis. "produk", "gudang".
  noun: string
}): DataTableEmpty {
  return {
    title: hasActiveFilters(searchParams)
      ? `Tidak ada ${noun} yang cocok dengan pencarian atau filter ini.`
      : `Belum ada ${noun}.`,
    minRows: LIST_MIN_ROWS,
  }
}

// Tinggi minimum tabel halaman daftar dalam baris, seperti list view hmx.
export const LIST_MIN_ROWS = 5
