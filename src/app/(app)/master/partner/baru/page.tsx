import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"

import { PartnerForm } from "../partner-form"

export const metadata: Metadata = { title: "Tambah partner · IT Inventory" }

export default function NewPartnerPage() {
  return (
    <NewRecordLayout
      title="Tambah partner"
      description="Kode partner tidak bisa diubah setelah disimpan."
      noun="partner"
    >
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <PartnerForm />
}
