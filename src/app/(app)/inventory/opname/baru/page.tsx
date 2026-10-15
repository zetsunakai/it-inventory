import type { Metadata } from "next"
import { Suspense } from "react"

import { StockCountForm } from "@/components/inventory/stock-count-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/server/queries/product-categories"
import { listInternalLocations } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Buat sesi opname · IT Inventory" }

export default function NewStockCountPage() {
  return (
    <>
      <PageHeader
        title="Buat sesi opname"
        description="Disimpan sebagai Draft. Saat Manajer menekan Mulai hitung, daftar hitung diambil dari stok di lingkup ini dan gudangnya dibekukan sampai opname disetujui atau dibatalkan."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-4xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  const user = await requirePermission("inventory:approve")
  const [locations, categories] = await Promise.all([
    listInternalLocations(user.id),
    listProductCategoryOptions(),
  ])
  return <StockCountForm locations={locations} categories={categories} />
}
