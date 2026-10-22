import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { DocumentFlow } from "@/modules/it-inventory/components/customs/document-flow"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Flow dokumen · IT Inventory" }

// Menu Flow Dokumen seperti hmx (action_it_inventory_document_flow, backlog H-06).
export default function DocumentFlowPage() {
  return (
    <>
      <PageHeader
        title="Flow dokumen"
        description="Pasangan dokumen masuk dan dokumen keluar kawasan. Pilih kotak untuk membuka daftar dokumen jenis itu."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <Flow />
      </Suspense>
    </>
  )
}

async function Flow() {
  await requirePermission("bc:read")
  return <DocumentFlow />
}
