import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRefCode, REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { findRefCode, getRefCode } from "@/server/queries/ref-codes"

import { RefCodeEditForm } from "../ref-code-forms"
import { InfoGrid } from "@/components/layout/info-grid"
import { recordActivity } from "@/server/queries/activity"
import { refCodeNeighbors } from "@/server/queries/neighbors"

export const metadata: Metadata = { title: "Ubah referensi · IT Inventory" }

export default function EditRefCodePage({ params }: PageProps<"/master/referensi/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full max-w-4xl" />}>
      <EditRefCode params={params} />
    </Suspense>
  )
}

async function EditRefCode({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("ref:write")
  const { id } = await params
  // Id bukan UUID = pasti tidak ada; jangan sampai jadi error query di Postgres.
  if (!z.uuid().safeParse(id).success) notFound()
  const row = await getRefCode(id)
  if (!row) notFound()

  const parentType = REF_CODE_PARENT_TYPES[row.type]
  const parent = parentType && row.parentCode ? await findRefCode(parentType, row.parentCode) : null
  const [neighbors, activity] = await Promise.all([
    refCodeNeighbors(row.type, row.code, row.parentCode),
    recordActivity("ref_codes", row.id, REF_ACTIVITY_LABELS),
  ])

  return (
    <DocumentLayout
      title={row.name}
      meta="Jenis dan kode tidak bisa diubah."
      crumbs={[{ label: formatRefCode(row) }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="referensi kepabeanan" />}
    >
      <InfoGrid
        items={[
          { label: "Jenis", value: REF_CODE_TYPE_LABELS[row.type] },
          { label: "Kode", value: <span className="font-mono">{row.code}</span> },
          ...(parentType
            ? [
                {
                  label: REF_CODE_TYPE_LABELS[parentType],
                  value: parent ? formatRefCode(parent) : row.parentCode,
                },
              ]
            : []),
        ]}
      />
      <RefCodeEditForm id={row.id} name={row.name} active={row.active} />
    </DocumentLayout>
  )
}

const REF_ACTIVITY_LABELS = {
  fields: { name: "Nama", parent_code: "Kode induk", active: "Aktif" },
}
