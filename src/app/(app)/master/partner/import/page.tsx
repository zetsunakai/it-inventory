import type { Metadata } from "next"
import { Suspense } from "react"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { PARTNER_COLUMNS } from "@/modules/inventory/server/master-io/partners"

import { importPartners } from "../actions"

export const metadata: Metadata = { title: "Import partner · IT Inventory" }

export default function ImportPartnersPage() {
  return (
    <DocumentLayout
      crumbs={[{ label: "Partner", href: "/master/partner" }, { label: "Import" }]}
      title="Import partner"
      meta="NPWP baru ditambahkan, NPWP yang sudah ada diperbarui (cabang dipilih lewat NITKU). Bila ada satu baris yang salah, tidak ada yang disimpan."
    >
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Guarded />
      </Suspense>
      <ImportColumnGuide columns={PARTNER_COLUMNS} />
    </DocumentLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return (
    <ImportForm
      action={importPartners}
      noun="partner"
      keyLabel="NPWP"
      listHref="/master/partner"
      exportHref="/master/partner/export?format=xlsx"
    />
  )
}
