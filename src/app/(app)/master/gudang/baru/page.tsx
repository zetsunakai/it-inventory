import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { WarehouseForm } from "../warehouse-forms"

export const metadata: Metadata = { title: "Tambah gudang · IT Inventory" }

export default function NewWarehousePage() {
  return (
    <NewRecordLayout
      title="Tambah gudang"
      description="Kode gudang tidak bisa diubah setelah disimpan. Lokasi ditambahkan setelahnya."
      noun="gudang"
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <WarehouseForm />
}
