import type { ReactNode } from "react"

import { PageCrumbs, type Crumb } from "./breadcrumb-context"
import { PageMessageSlot } from "./layout/page-message"

// Judul halaman di area konten. Statis, jadi ikut di-prerender. Aksi (tombol alur dokumen, Buat,
// Import) di kanan judul; pesan hasil aksi di bawahnya (usePageMessage, UF-03).
// description hanya untuk informasi yang tidak ada di judul (aturan yang berlaku, fakta penting);
// jangan mengulang judul (skill ui-it-inventory).
// Judul juga menjadi tingkat terakhir breadcrumb header (UF-02), kecuali halaman memberi crumbs
// sendiri: dokumen induk (dengan href) lalu label ringkas halaman ini, mis. nomor dokumen.
export function PageHeader({
  title,
  description,
  actions,
  crumbs,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="font-display text-page-title font-bold tracking-tight text-balance">
            {title}
          </h1>
          {description && <div className="text-control text-muted-foreground">{description}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[60%] sm:justify-end">
            {actions}
          </div>
        )}
      </div>
      <PageMessageSlot />
      <PageCrumbs crumbs={crumbs ?? [{ label: title }]} />
    </div>
  )
}
