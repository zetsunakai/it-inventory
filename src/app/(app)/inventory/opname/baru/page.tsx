import type { Metadata } from "next"
import { Suspense } from "react"

import { StockCountForm } from "@/modules/inventory/components/stock-count-form"
import { StatusSteps } from "@/components/document/status-steps"
import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/modules/inventory/server/queries/product-categories"
import { listInternalLocations } from "@/modules/inventory/server/queries/transfers"

export const metadata: Metadata = { title: "Buat sesi opname · IT Inventory" }

export default function NewStockCountPage() {
  return (
    <NewRecordLayout
      title="Buat sesi opname"
      description="Disimpan sebagai Draft. Saat Manajer menekan Mulai hitung, daftar hitung diambil dari stok di lingkup ini dan gudangnya dibekukan sampai opname disetujui atau dibatalkan."
      noun="sesi opname"
      status={
        <StatusSteps
          steps={[
            { code: "draft", label: "Draft" },
            { code: "counting", label: "Berjalan" },
            { code: "counted", label: "Selesai hitung" },
            { code: "review", label: "Menunggu persetujuan" },
            { code: "approved", label: "Disetujui" },
          ]}
          current="draft"
        />
      }
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
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
