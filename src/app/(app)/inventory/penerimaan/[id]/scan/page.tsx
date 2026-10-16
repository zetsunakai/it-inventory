import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { ReceiptScanner } from "@/components/inventory/receipt-scanner"
import { hasLotDetail, receiptLotLine } from "@/components/inventory/transfer-pages"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { getTransfer } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Scan penerimaan · IT Inventory" }

// Layar scan tablet penerimaan (backlog RU-03): pindai kode produk lalu lot/nomor seri.
export default function ReceiptScanPage({ params }: PageProps<"/inventory/penerimaan/[id]/scan">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-2xl" />}>
      <Scanner params={params} />
    </Suspense>
  )
}

async function Scanner({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const transfer = await getTransfer(user.id, id)
  if (!transfer || transfer.type !== "receipt") notFound()
  const detailHref = `/inventory/penerimaan/${transfer.id}`
  // Scan hanya untuk penerimaan Siap; status lain kembali ke detailnya.
  if (transfer.status !== "ready") redirect(detailHref)
  return (
    <>
      <PageHeader
        title={`Scan ${transfer.number}`}
        crumbs={[{ label: transfer.number, href: detailHref }, { label: "Scan" }]}
        description={transfer.partner?.name}
      />
      <ReceiptScanner
        transferId={transfer.id}
        detailHref={detailHref}
        lines={transfer.lines.map((line) =>
          // Di layar scan, yang dicatat hanya yang dipindai: baris tanpa rincian mulai dari 0.
          hasLotDetail(line) ? receiptLotLine(line) : { ...receiptLotLine(line), rows: [] },
        )}
      />
    </>
  )
}
