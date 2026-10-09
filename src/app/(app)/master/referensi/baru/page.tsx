import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { RefCodeCreateForm } from "../ref-code-forms"

export const metadata: Metadata = { title: "Tambah referensi · IT Inventory" }

export default function NewRefCodePage() {
  return (
    <>
      <PageHeader
        title="Tambah referensi"
        description="Jenis dan kode tidak bisa diubah setelah disimpan."
      />
      <Suspense fallback={<Skeleton className="h-64 w-full max-w-xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("ref:write")
  return <RefCodeCreateForm />
}
