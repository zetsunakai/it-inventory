import type { Metadata } from "next"
import { Suspense } from "react"

import { InterwarehouseForm } from "@/components/inventory/interwarehouse-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listInternalLocations, listUomChoices } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Buat transfer antar gudang · IT Inventory" }

export default function NewInterwarehousePage() {
  return (
    <>
      <PageHeader
        title="Buat transfer antar gudang"
        description="Disimpan sebagai Draft. Saat dikonfirmasi, transfer keluar dibuat dan stok gudang asal dipesan."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-4xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  const user = await requirePermission("inventory:write")
  const [locations, uoms] = await Promise.all([listInternalLocations(user.id), listUomChoices()])
  return <InterwarehouseForm locations={locations} uoms={uoms} />
}
