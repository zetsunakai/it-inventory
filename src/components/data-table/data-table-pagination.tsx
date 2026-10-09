import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { pageCount, pageHref, type RawSearchParams } from "@/lib/list-params"
import { cn } from "@/lib/utils"

// Navigasi halaman berupa link biasa, jadi tetap jalan tanpa JavaScript
// dan filter yang sedang aktif ikut terbawa.
export function DataTablePagination({
  searchParams,
  page,
  pageSize,
  total,
}: {
  searchParams: RawSearchParams
  page: number
  pageSize: number
  total: number
}) {
  const pages = pageCount(total, pageSize)
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row">
      <p>
        {total === 0
          ? "Tidak ada data"
          : `Menampilkan ${formatNumber(from)}–${formatNumber(to)} dari ${formatNumber(total)}`}
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-2">
        <PageLink href={pageHref(searchParams, page - 1)} disabled={page <= 1} label="Sebelumnya">
          <ChevronLeft />
        </PageLink>
        <span>
          Halaman {formatNumber(Math.min(page, pages))} dari {formatNumber(pages)}
        </span>
        <PageLink
          href={pageHref(searchParams, page + 1)}
          disabled={page >= pages}
          label="Berikutnya"
        >
          <ChevronRight />
        </PageLink>
      </nav>
    </div>
  )
}

function PageLink({
  href,
  disabled,
  label,
  children,
}: {
  href: string
  disabled: boolean
  label: string
  children: ReactNode
}) {
  const className = buttonVariants({ variant: "outline", size: "icon" })
  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "opacity-50")}>
        {children}
      </span>
    )
  }
  return (
    <Link href={href} aria-label={label} className={className}>
      {children}
    </Link>
  )
}
