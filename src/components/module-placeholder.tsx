import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { findNavItem } from "@/lib/navigation"
import { requirePermission, requireUser } from "@/server/auth/session"

// Halaman sementara untuk modul yang belum dikerjakan (backlog M0-09).
// Tetap mengecek izin, supaya membuka URL langsung pun mengikuti aturan peran.

export function moduleMetadata(href: string): Metadata {
  return { title: `${findNavItem(href).title} · IT Inventory` }
}

export function ModulePlaceholder({ href }: { href: string }) {
  const item = findNavItem(href)
  return (
    <>
      <PageHeader title={item.title} />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <PlaceholderBody href={href} />
      </Suspense>
    </>
  )
}

async function PlaceholderBody({ href }: { href: string }) {
  const item = findNavItem(href)
  if (item.permission) await requirePermission(item.permission)
  else await requireUser()

  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      Modul ini belum tersedia.
      {item.plannedIn && <> Dijadwalkan di {item.plannedIn}.</>}
    </div>
  )
}
