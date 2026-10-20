import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { CountScanner } from "@/modules/inventory/components/count-scanner"
import { countScopeLocations, getStockCount } from "@/modules/inventory/server/queries/stock-counts"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Scan opname · IT Inventory" }

// Layar hitung opname dengan scan untuk tablet/HP (I-04). Hanya selama sesi Berjalan.
export default function StockCountScanPage({ params }: PageProps<"/inventory/opname/[id]/scan">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-2xl" />}>
      <Scanner params={params} />
    </Suspense>
  )
}

async function Scanner({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const count = await getStockCount(user.id, id)
  if (!count) notFound()
  const detailHref = `/inventory/opname/${count.id}`
  if (count.status !== "counting") redirect(detailHref)
  return (
    <>
      <PageHeader
        title={`Scan ${count.number}`}
        crumbs={[{ label: count.number, href: detailHref }, { label: "Scan" }]}
        description={`${count.warehouseCode} · ${count.locationPath ?? "seluruh gudang"}`}
      />
      <CountScanner
        countId={count.id}
        detailHref={detailHref}
        locations={await countScopeLocations(count.id)}
        prefilled={count.initialCounted !== "empty"}
      />
    </>
  )
}
