import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { WarehouseForm } from "../warehouse-forms"

export const metadata: Metadata = { title: "Tambah gudang · IT Inventory" }

export default function NewWarehousePage() {
  return (
    <>
      <PageHeader
        title="Tambah gudang"
        description="Kode gudang tidak bisa diubah setelah disimpan. Lokasi ditambahkan setelahnya."
      />
      <Suspense fallback={<Skeleton className="h-80 w-full max-w-2xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <WarehouseForm />
}
