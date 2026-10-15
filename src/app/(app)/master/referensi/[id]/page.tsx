import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRefCode, REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { findRefCode, getRefCode } from "@/server/queries/ref-codes"

import { RefCodeEditForm } from "../ref-code-forms"
import { InfoGrid } from "@/components/layout/info-grid"

export const metadata: Metadata = { title: "Ubah referensi · IT Inventory" }

export default function EditRefCodePage({ params }: PageProps<"/master/referensi/[id]">) {
  return (
    <>
      <PageHeader title="Ubah referensi" description="Jenis dan kode tidak bisa diubah." />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-4xl" />}>
        <EditRefCode params={params} />
      </Suspense>
    </>
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

  return (
    <div className="space-y-6">
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
    </div>
  )
}
