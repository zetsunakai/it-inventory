import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listUomCategories } from "@/modules/inventory/server/queries/uoms"

import { UomCreateForm } from "../uom-forms"

export const metadata: Metadata = { title: "Tambah satuan · IT Inventory" }

export default function NewUomPage() {
  return (
    <NewRecordLayout
      title="Tambah satuan"
      description="Kode dan kategori tidak bisa diubah setelah disimpan."
      noun="satuan"
    >
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  const categories = (await listUomCategories()).filter((category) => category.active)
  return <UomCreateForm categories={categories} />
}
