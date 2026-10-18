import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { refCodeMenuTitle, refCodeTypeFromSlug } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"

import { RefCodeCreateForm } from "../../ref-code-forms"

export const metadata: Metadata = { title: "Tambah referensi · IT Inventory" }

export default function NewRefCodePage({ params }: PageProps<"/master/referensi/[jenis]/baru">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <NewRefCode params={params} />
    </Suspense>
  )
}

async function NewRefCode({ params }: { params: Promise<{ jenis: string }> }) {
  await requirePermission("ref:write")
  const type = refCodeTypeFromSlug((await params).jenis)
  if (!type) notFound()
  return (
    <NewRecordLayout
      title={`Tambah ${refCodeMenuTitle(type).replace(/^R/, "r")}`}
      description="Kode tidak bisa diubah setelah disimpan."
      noun="referensi"
    >
      <RefCodeCreateForm type={type} />
    </NewRecordLayout>
  )
}
