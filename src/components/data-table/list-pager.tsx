import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { pageCount, pageHref, type RawSearchParams } from "@/lib/list-params"
import { cn } from "@/lib/utils"

// Pager ringkas di kanan atas daftar (RU-22, seperti hmx): "1–20 / 45" lalu sebelumnya/berikutnya.
// Berupa link biasa, jadi filter yang aktif ikut terbawa dan tetap jalan tanpa JavaScript.
export function ListPager({
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
    <nav aria-label="Pagination" className="flex shrink-0 items-center gap-1 text-control">
      <span className="px-2 text-muted-foreground tabular-nums" aria-live="polite">
        {total === 0 ? "0" : `${formatNumber(from)}–${formatNumber(to)}`} / {formatNumber(total)}
      </span>
      <PageLink href={pageHref(searchParams, page - 1)} disabled={page <= 1} label="Sebelumnya">
        <ChevronLeft />
      </PageLink>
      <PageLink href={pageHref(searchParams, page + 1)} disabled={page >= pages} label="Berikutnya">
        <ChevronRight />
      </PageLink>
    </nav>
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
      <span aria-disabled="true" aria-label={label} className={cn(className, "opacity-40")}>
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
