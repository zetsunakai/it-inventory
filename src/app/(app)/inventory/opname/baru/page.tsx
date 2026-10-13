import type { Metadata } from "next"
import { Suspense } from "react"

import { StockCountForm } from "@/components/inventory/stock-count-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listInternalLocations } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Buat sesi opname · IT Inventory" }

export default function NewStockCountPage() {
  return (
    <>
      <PageHeader
        title="Buat sesi opname"
        description="Cut-off adalah saat sesi dibuat. Daftar hitung berisi semua barang yang punya stok di lingkup ini."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  const user = await requirePermission("inventory:approve")
  return <StockCountForm locations={await listInternalLocations(user.id)} />
}
