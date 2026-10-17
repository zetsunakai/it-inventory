import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDateTime } from "@/lib/format"
import { MOVEMENT_CODE_DIRECTIONS, movementLabel } from "@/modules/inventory/lib/inventory"
import { transferHref } from "@/modules/inventory/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import { getLotTrace, type LotMove, type LotTrace } from "@/modules/inventory/server/queries/lots"
import { Section } from "@/components/layout/section"

export const metadata: Metadata = { title: "Penelusuran lot · IT Inventory" }

type Balance = LotTrace["balances"][number]

function place(path: string, warehouse: string | null) {
  return warehouse ? `${warehouse} · ${path}` : path
}

export default function LotPage({ params }: PageProps<"/inventory/lot/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
      <Trace params={params} />
    </Suspense>
  )
}

async function Trace({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const lot = await getLotTrace(user.id, id)
  if (!lot) notFound()
  const unit = lot.uomCode
  const serial = lot.tracking === "serial"

  const balanceColumns: DataTableColumn<Balance>[] = [
    {
      header: "Lokasi",
      className: "w-full",
      cell: (row) => (
        <span className="font-mono text-caption">{place(row.locationPath, row.warehouseCode)}</span>
      ),
    },
    { header: "Saldo", align: "right", cell: (row) => `${formatDecimal(row.qty)} ${unit}` },
    {
      header: "Dipesan",
      align: "right",
      cell: (row) => (Number(row.reservedQty) ? `${formatDecimal(row.reservedQty)} ${unit}` : "—"),
    },
    {
      header: "Tersedia",
      align: "right",
      cell: (row) => (
        <span className="font-medium">
          {formatDecimal((Number(row.qty) - Number(row.reservedQty)).toFixed(4))} {unit}
        </span>
      ),
    },
  ]

  const moveColumns: DataTableColumn<LotMove>[] = [
    { header: "Tanggal", cell: (row) => formatDateTime(row.doneAt) },
    {
      header: "Transaksi",
      cell: (row) => (
        <span className="flex flex-col">
          <Link
            href={transferHref(row.transferType, row.transferId)}
            className="font-mono text-primary underline-offset-4 hover:underline"
          >
            {row.transferNumber}
          </Link>
          <span className="text-caption text-muted-foreground">
            {movementLabel(row.movementCode, row.usageType)}
          </span>
        </span>
      ),
    },
    {
      header: "Dari → ke",
      className: "w-full whitespace-normal",
      cell: (row) => (
        <span className="flex flex-col">
          <span className="font-mono text-caption">
            {place(row.sourcePath, row.sourceWarehouse)} →{" "}
            {place(row.destinationPath, row.destinationWarehouse)}
          </span>
          {row.partnerName && (
            <span className="text-caption text-muted-foreground">{row.partnerName}</span>
          )}
        </span>
      ),
    },
    {
      header: "Qty",
      align: "right",
      cell: (row) => {
        // Masuk ke gudang ditandai +, keluar −; pindah di dalam gudang tanpa tanda.
        const sign = { in: "+", out: "−", internal: "" }[MOVEMENT_CODE_DIRECTIONS[row.movementCode]]
        return `${sign}${formatDecimal(row.qty)} ${unit}`
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${serial ? "Nomor seri" : "Lot"} ${lot.name}`}
        crumbs={[{ label: lot.name }]}
        description={
          <span>
            <Link
              href={`/inventory/stok/${lot.productId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {lot.sku}
            </Link>{" "}
            {lot.productName}
          </span>
        }
      />
      <Section title="Stok sekarang">
        <DataTable
          columns={balanceColumns}
          rows={lot.balances}
          rowKey={(row) => row.locationId}
          empty={{ title: `${serial ? "Nomor seri" : "Lot"} ini sudah tidak ada di gudang.` }}
        />
      </Section>
      <Section title="Riwayat masuk-keluar">
        <DataTable
          columns={moveColumns}
          rows={lot.moves}
          rowKey={(row) => row.id}
          empty={{ title: "Belum ada pergerakan." }}
        />
      </Section>
    </div>
  )
}
