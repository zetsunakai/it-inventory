import type { Metadata } from "next"
import { Suspense } from "react"

import { InterwarehouseForm } from "@/modules/inventory/components/interwarehouse-form"
import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listInternalLocations, listUomChoices } from "@/modules/inventory/server/queries/transfers"

export const metadata: Metadata = { title: "Buat transfer antar gudang · IT Inventory" }

export default function NewInterwarehousePage() {
  return (
    <NewRecordLayout
      title="Buat transfer antar gudang"
      description="Disimpan sebagai Draft. Saat dikonfirmasi, transfer keluar dibuat dan stok gudang asal dipesan."
      noun="permintaan"
    >
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  const user = await requirePermission("inventory:write")
  const [locations, uoms] = await Promise.all([listInternalLocations(user.id), listUomChoices()])
  return <InterwarehouseForm locations={locations} uoms={uoms} />
}
