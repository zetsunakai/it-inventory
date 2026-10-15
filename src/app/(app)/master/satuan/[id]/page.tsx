import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { requirePermission } from "@/server/auth/session"
import { getUom } from "@/server/queries/uoms"
import { recordActivity } from "@/server/queries/activity"
import { uomNeighbors } from "@/server/queries/neighbors"

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
      <RecordModes
        key={uom.id}
        canEdit
        createHref="/master/satuan/baru"
        view={
          <ViewSection title="Data satuan">
            <StaticField label="Nama satuan" value={uom.name} span={12} />
            <StaticField
              label="Faktor konversi"
              value={`1 ${uom.code} = ${formatDecimal(uom.factor)} ${uom.referenceCode ?? uom.code}`}
              reason={
                uom.isReference
                  ? `${uom.code} adalah satuan acuan kategorinya, faktornya selalu 1.`
                  : undefined
              }
            />
            <StaticField label="Pembulatan" value={formatDecimal(uom.rounding)} />
            <StaticField label="Status" value={uom.active ? "Aktif" : "Diarsipkan"} />
          </ViewSection>
        }
        form={<UomEditForm uom={uom} />}
      />
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
