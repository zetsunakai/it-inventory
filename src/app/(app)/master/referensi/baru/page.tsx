import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { RefCodeCreateForm } from "../ref-code-forms"

export const metadata: Metadata = { title: "Tambah referensi · IT Inventory" }

export default function NewRefCodePage() {
  return (
    <NewRecordLayout
      title="Tambah referensi"
      description="Jenis dan kode tidak bisa diubah setelah disimpan."
      noun="referensi"
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("ref:write")
  return <RefCodeCreateForm />
}
