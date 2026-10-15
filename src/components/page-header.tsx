import type { ReactNode } from "react"

import { PageCrumbs, type Crumb } from "./breadcrumb-context"

// Judul halaman di area konten. Statis, jadi ikut di-prerender.
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-control text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      <PageCrumbs crumbs={crumbs ?? [{ label: title }]} />
    </div>
  )
}
