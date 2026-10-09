import type { ReactNode } from "react"

// Judul halaman di area konten. Statis, jadi ikut di-prerender.
// description hanya untuk informasi yang tidak ada di judul (aturan yang berlaku, fakta penting);
// jangan mengulang judul (skill ui-it-inventory).
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
