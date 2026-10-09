import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { PartnerForm } from "../partner-form"

export const metadata: Metadata = { title: "Tambah partner · IT Inventory" }

export default function NewPartnerPage() {
  return (
    <>
      <PageHeader
        title="Tambah partner"
        description="Kode partner tidak bisa diubah setelah disimpan."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-3xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <PartnerForm />
}
