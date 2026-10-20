import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { importStockCount } from "@/modules/inventory/actions/stock-counts"
import { getStockCount } from "@/modules/inventory/server/queries/stock-counts"
import { COUNT_COLUMNS } from "@/modules/inventory/server/stock-count-io"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Import hasil hitung · IT Inventory" }

// Import hasil hitung opname dari file daftar hitung yang sudah diisi (I-04).
export default function ImportStockCountPage({
  params,
}: PageProps<"/inventory/opname/[id]/import">) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <Guarded params={params} />
    </Suspense>
  )
}

async function Guarded({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const count = await getStockCount(user.id, id)
  if (!count) notFound()
  const detailHref = `/inventory/opname/${count.id}`
  if (count.status !== "counting") redirect(detailHref)
  return (
    <>
      <PageHeader
        title={`Import hasil hitung ${count.number}`}
        crumbs={[{ label: count.number, href: detailHref }, { label: "Import" }]}
        description="Baris dicocokkan lewat lokasi, product code, dan lot. Kombinasi baru di lingkup sesi menjadi barang temuan. Qty kosong tidak mengubah baris. Bila ada satu baris yang salah, tidak ada yang disimpan."
      />
      <ImportForm
        action={importStockCount}
        noun="baris hitung"
        keyLabel="Product code"
        listHref={detailHref}
        exportHref={`${detailHref}/export?format=xlsx`}
        fields={{ countId: count.id }}
        resultLabel="Kembali ke sesi opname"
      />
      <ImportColumnGuide columns={COUNT_COLUMNS} />
    </>
  )
}
