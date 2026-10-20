import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { PageCrumbs, type Crumb } from "@/components/breadcrumb-context"
import { PageMessageSlot } from "@/components/layout/page-message"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { DocumentAside, SidePanel } from "./side-panel"

export type RecordNeighbors = {
  prev?: { href: string; label: string }
  next?: { href: string; label: string }
}

// Status berada di kanan baris aksi; aktivitas tetap di samping isi dokumen.
export function DocumentLayout({
  title,
  hideTitle = false,
  crumbs,
  meta,
  actions,
  status,
  neighbors,
  activity,
  children,
}: {
  title: string
  hideTitle?: boolean
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
        <div>
          <div className="min-w-0 space-y-3">
            {(!hideTitle || neighbors?.prev || neighbors?.next) && (
              <div className="flex items-center gap-3">
                {!hideTitle && (
                  <h1 className="min-w-0 font-display text-page-title font-bold tracking-tight text-balance">
                    {title}
                  </h1>
                )}
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
            )}
            {meta && <div className="text-control text-muted-foreground">{meta}</div>}
          </div>
        </div>
        <PageMessageSlot />
        <PageCrumbs crumbs={crumbs ?? [{ label: title }]} />
      </div>
      <div
        className={cn(
          "grid items-start gap-6",
          (status || activity) && "xl:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        <div className="min-w-0 space-y-4">
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          {children}
        </div>
        {(status || activity) &&
          (status ? (
            <div className="flex min-w-0 flex-col gap-4 xl:w-80">
              {status}
              {activity && (
                <SidePanel title="Aktivitas" wide>
                  {activity}
                </SidePanel>
              )}
            </div>
          ) : (
            <DocumentAside>
              {activity && <SidePanel title="Aktivitas">{activity}</SidePanel>}
            </DocumentAside>
          ))}
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
