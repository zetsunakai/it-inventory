import type { Metadata } from "next"
import { Suspense } from "react"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { PARTNER_COLUMNS } from "@/server/master-io/partners"

import { importPartners } from "../actions"

export const metadata: Metadata = { title: "Import partner · IT Inventory" }

export default function ImportPartnersPage() {
  return (
    <>
      <PageHeader
        title="Import partner"
        description="Kode baru ditambahkan, kode yang sudah ada diperbarui. Bila ada satu baris yang salah, tidak ada yang disimpan."
      />
      <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
        <Guarded />
      </Suspense>
      <ImportColumnGuide columns={PARTNER_COLUMNS} />
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return (
    <ImportForm
      action={importPartners}
      noun="partner"
      keyLabel="Kode"
      listHref="/master/partner"
      exportHref="/master/partner/export?format=xlsx"
    />
  )
}
