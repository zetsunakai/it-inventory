import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { MoveScanner } from "@/modules/inventory/components/move-scanner"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"
import { listInternalLocations } from "@/modules/inventory/server/queries/transfers"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Scan pindah lokasi · IT Inventory" }

// Pindah lokasi dari HP/tablet tanpa mengetik nama lokasi (I-05).
export default function MoveScanPage() {
  return (
    <>
      <PageHeader
        title="Scan pindah lokasi"
        crumbs={[{ label: "Scan" }]}
        description="Pindai lokasi asal, lokasi tujuan, lalu barangnya. Pindahkan langsung memvalidasi transfer."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-2xl" />}>
        <Scanner />
      </Suspense>
    </>
  )
}

async function Scanner() {
  const user = await requirePermission("inventory:write")
  const locations = await listInternalLocations(user.id)
  return (
    <MoveScanner
      listHref={TRANSFER_KINDS.internal.path}
      locations={locations.map(({ id, code, path, warehouseId }) => ({
        id,
        code,
        path,
        warehouseId,
      }))}
    />
  )
}
