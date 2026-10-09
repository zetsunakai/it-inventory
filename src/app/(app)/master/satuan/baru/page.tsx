import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listUomCategories } from "@/server/queries/uoms"

import { UomCreateForm } from "../uom-forms"

export const metadata: Metadata = { title: "Tambah satuan · IT Inventory" }

export default function NewUomPage() {
  return (
    <>
      <PageHeader
        title="Tambah satuan"
        description="Kode dan kategori tidak bisa diubah setelah disimpan."
      />
      <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  const categories = (await listUomCategories()).filter((category) => category.active)
  return <UomCreateForm categories={categories} />
}
