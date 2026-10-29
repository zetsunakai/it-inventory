import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { DocumentChain } from "@/modules/it-inventory/components/customs/document-chain"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Rantai dokumen · IT Inventory" }

// Rantai dokumen (H-06): jalur pemasukan → penimbunan → pengeluaran per dokumen masuk.
export default function DocumentChainPage() {
  return (
    <>
      <PageHeader
        title="Rantai dokumen"
        description="Jalur pemasukan → penimbunan → pengeluaran barang kawasan beserta dokumen BC di setiap tahap. Sorot satu jalur untuk melihat pasangannya; satu dokumen keluar bisa muncul di beberapa jalur."
      />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <Chain />
      </Suspense>
    </>
  )
}

async function Chain() {
  await requirePermission("bc:read")
  return <DocumentChain />
}
