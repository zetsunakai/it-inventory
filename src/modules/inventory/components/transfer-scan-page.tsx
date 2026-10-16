import { notFound, redirect } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { hasPermission } from "@/lib/permissions"
import type { TransferKind } from "@/modules/inventory/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import { getTransfer } from "@/modules/inventory/server/queries/transfers"

import { LineScanner } from "./line-scanner"
import { canRecordLots, hasLotDetail, lotLine } from "./transfer-pages"

// Layar scan tablet penerimaan dan pengiriman (backlog RU-03, I-01): pindai kode produk lalu
// lot/nomor seri. Hanya untuk transfer yang rinciannya boleh diisi; selain itu kembali ke detail.
export function TransferScanPage({
  kind,
  params,
}: {
  kind: TransferKind
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-2xl" />}>
      <Scanner kind={kind} params={params} />
    </Suspense>
  )
}

async function Scanner({ kind, params }: { kind: TransferKind; params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const transfer = await getTransfer(user.id, id)
  if (!transfer || transfer.type !== kind.type) notFound()
  const detailHref = `${kind.path}/${transfer.id}`
  if (!canRecordLots(transfer, hasPermission(user.roles, "inventory:write"))) redirect(detailHref)
  return (
    <>
      <PageHeader
        title={`Scan ${transfer.number}`}
        crumbs={[{ label: transfer.number, href: detailHref }, { label: "Scan" }]}
        description={transfer.partner?.name}
      />
      <LineScanner
        transferId={transfer.id}
        detailHref={detailHref}
        lines={transfer.lines.map((line) =>
          // Di layar scan, yang dicatat hanya yang dipindai: baris mulai dari 0, kecuali rincian
          // penerimaan yang sudah dicatat user. Pesanan pengiriman hasil Cek stok bukan catatan user.
          transfer.type === "receipt" && hasLotDetail(line)
            ? lotLine(transfer, line)
            : { ...lotLine(transfer, line), rows: [] },
        )}
      />
    </>
  )
}
