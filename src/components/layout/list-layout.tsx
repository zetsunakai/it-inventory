import type { ComponentProps, ReactNode } from "react"

import { PageHeader } from "@/components/page-header"

// Kerangka semua halaman daftar. Toolbar, tabel, dan batas Suspense tetap di pemilik data,
// supaya filter, izin, serta bagian tambahan bisa berbeda tanpa mengubah susunan halaman.
// Semua daftar hanya menampilkan judul dan aksi header, tanpa teks deskripsi.
export function ListLayout({
  children,
  title,
  actions,
  crumbs,
}: ComponentProps<typeof PageHeader> & { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title={title} actions={actions} crumbs={crumbs} />
      {children}
    </div>
  )
}
