import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { PageCrumbs, type Crumb } from "@/components/breadcrumb-context"
import { PageMessageSlot } from "@/components/layout/page-message"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { SidePanel } from "./side-panel"

export type RecordNeighbors = {
  prev?: { href: string; label: string }
  next?: { href: string; label: string }
}

// Kerangka form/dokumen ala hmx-002 (backlog RU-23):
//   kiri: judul + tombol record sebelumnya/berikutnya, meta, tombol aksi alur;
//   kanan: kartu status (StatusSteps);
//   isi dokumen (grup info, tab) dengan panel log aktivitas di samping.
export function DocumentLayout({
  title,
  crumbs,
  meta,
  actions,
  status,
  neighbors,
  activity,
  children,
}: {
  title: string
  crumbs?: Crumb[]
  meta?: ReactNode
  actions?: ReactNode
  status?: ReactNode
  neighbors?: RecordNeighbors
  activity?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance">
                {title}
              </h1>
              {neighbors && (neighbors.prev || neighbors.next) && (
                <nav aria-label="Record lain" className="flex shrink-0 gap-1">
                  <NeighborLink target={neighbors.prev} label="Sebelumnya">
                    <ChevronLeft />
                  </NeighborLink>
                  <NeighborLink target={neighbors.next} label="Berikutnya">
                    <ChevronRight />
                  </NeighborLink>
                </nav>
              )}
            </div>
            {meta && <div className="text-control text-muted-foreground">{meta}</div>}
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
          {status}
        </div>
        <PageMessageSlot />
        <PageCrumbs crumbs={crumbs ?? [{ label: title }]} />
      </div>
      <div
        className={cn("grid items-start gap-6", activity && "xl:grid-cols-[minmax(0,1fr)_auto]")}
      >
        <div className="min-w-0 space-y-8">{children}</div>
        {activity && <SidePanel title="Aktivitas">{activity}</SidePanel>}
      </div>
    </div>
  )
}

function NeighborLink({
  target,
  label,
  children,
}: {
  target?: { href: string; label: string }
  label: string
  children: ReactNode
}) {
  const className = buttonVariants({ variant: "outline", size: "icon-sm" })
  if (!target) {
    return (
      <span aria-disabled="true" aria-label={label} className={cn(className, "opacity-40")}>
        {children}
      </span>
    )
  }
  return (
    <Link
      href={target.href}
      aria-label={`${label}: ${target.label}`}
      title={target.label}
      className={className}
    >
      {children}
    </Link>
  )
}
