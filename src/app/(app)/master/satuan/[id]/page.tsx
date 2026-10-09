import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { getUom } from "@/server/queries/uoms"

import { UomEditForm } from "../uom-forms"

export const metadata: Metadata = { title: "Ubah satuan · IT Inventory" }

export default function EditUomPage({ params }: PageProps<"/master/satuan/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-xl" />}>
      <EditUom params={params} />
    </Suspense>
  )
}

async function EditUom({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("master:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const uom = await getUom(id)
  if (!uom) notFound()

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ubah satuan ${uom.code}`}
        description={`Kategori ${uom.categoryName}. Kode, kategori, dan status acuan tidak bisa diubah.`}
      />
      <UomEditForm uom={uom} />
    </div>
  )
}
