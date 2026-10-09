import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatRefCode, REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { findRefCode, getRefCode } from "@/server/queries/ref-codes"

import { RefCodeEditForm } from "../ref-code-forms"

export const metadata: Metadata = { title: "Ubah referensi · IT Inventory" }

export default function EditRefCodePage({ params }: PageProps<"/master/referensi/[id]">) {
  return (
    <>
      <PageHeader
        title="Ubah referensi"
        description="Jenis dan kode tidak bisa diubah."
        actions={
          <Link href="/master/referensi" className={buttonVariants({ variant: "outline" })}>
            Kembali ke daftar
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-xl" />}>
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
      <dl className="grid max-w-xl grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Jenis</dt>
        <dd>{REF_CODE_TYPE_LABELS[row.type]}</dd>
        <dt className="text-muted-foreground">Kode</dt>
        <dd className="font-mono">{row.code}</dd>
        {parentType && (
          <>
            <dt className="text-muted-foreground">{REF_CODE_TYPE_LABELS[parentType]}</dt>
            <dd>{parent ? formatRefCode(parent) : row.parentCode}</dd>
          </>
        )}
      </dl>
      <RefCodeEditForm id={row.id} name={row.name} active={row.active} />
    </div>
  )
}
