import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { getUom } from "@/server/queries/uoms"
import { recordActivity } from "@/server/queries/activity"
import { uomNeighbors } from "@/server/queries/neighbors"

import { deleteUom } from "../actions"
import { UomEditForm } from "../uom-forms"

export const metadata: Metadata = { title: "Ubah satuan · IT Inventory" }

export default function EditUomPage({ params }: PageProps<"/master/satuan/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-4xl" />}>
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
  const [neighbors, activity] = await Promise.all([
    uomNeighbors(uom.categoryId, uom.id),
    recordActivity("uoms", uom.id, UOM_ACTIVITY_LABELS),
  ])

  return (
    <DocumentLayout
      title={`${uom.code} · ${uom.name}`}
      meta={`Kategori ${uom.categoryName}. Kode, kategori, dan status acuan tidak bisa diubah.`}
      crumbs={[{ label: uom.code }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="satuan" />}
    >
      <UomEditForm uom={uom} />
      {/* Satuan acuan tidak bisa dihapus (deleteUom), jadi bagian ini tidak ditampilkan. */}
      {!uom.isReference && (
        <DeleteRecord
          action={deleteUom}
          id={uom.id}
          noun="satuan"
          label={uom.code}
          listHref="/master/satuan"
        />
      )}
    </DocumentLayout>
  )
}

const UOM_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    factor: "Faktor konversi",
    product_id: "Produk",
    rounding: "Pembulatan",
    active: "Aktif",
  },
}
