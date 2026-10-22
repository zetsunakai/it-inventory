import {
  FileText,
  Package,
  PackageCheck,
  PackageX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { formatDecimal } from "@/lib/decimal"
import { formatDate, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import { MOVEMENT_CODE_LABELS } from "@/modules/inventory/lib/inventory"
import { transferHref } from "@/modules/inventory/lib/transfer"
import type {
  ActiveTransfer,
  InventoryDashboard,
} from "@/modules/inventory/server/queries/dashboard"

import { WarehouseStockChart } from "./warehouse-stock-chart"

// Dashboard inventory seperti Inventory Dashboard hmx-002 (webx_dashboard): grid 12 kolom, tile
// (ikon 32px, judul 13px tebal, nilai 36px tebal, keterangan di bawah), lalu chart dan list dalam
// kartu berjudul. Susunan item mengikuti inventory_dashboard_data.xml.

const CARD = "rounded-xl border bg-card"

function Tile({
  icon: Icon,
  title,
  value,
  footer,
  href,
  className,
}: {
  icon: LucideIcon
  title: string
  value: ReactNode
  footer?: ReactNode
  href?: string
  className?: string
}) {
  const body = (
    <>
      <span className="mb-2 flex items-center gap-2.5">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <span className="text-caption font-semibold text-foreground">{title}</span>
      </span>
      <span className="mb-2 text-4xl leading-tight font-bold text-foreground tabular-nums">
        {value}
      </span>
      {footer && <span className="text-caption text-muted-foreground">{footer}</span>}
    </>
  )
  const classes = cn(CARD, "flex flex-col p-4", className)
  return href ? (
    <Link
      href={href}
      className={cn(
        classes,
        "transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  )
}

function Panel({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn(CARD, "flex min-w-0 flex-col p-5", className)} aria-label={title}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {count && <span className="text-caption text-muted-foreground">{count}</span>}
      </div>
      {children}
    </section>
  )
}

const RECENT_COLUMNS: DataTableColumn<ActiveTransfer>[] = [
  {
    header: "Nomor",
    cell: (row) => (
      <Link
        href={transferHref(row.type, row.id)}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  {
    header: "Jenis",
    className: "w-full whitespace-normal",
    cell: (row) => MOVEMENT_CODE_LABELS[row.movementCode] ?? row.movementCode,
  },
  {
    header: "Rencana",
    cell: (row) =>
      row.scheduledDate ? formatDate(new Date(`${row.scheduledDate}T00:00:00+07:00`)) : "—",
  },
  { header: "Status", cell: (row) => <TransferStatusBadge status={row.status} /> },
]

export function InventoryDashboardView({ data }: { data: InventoryDashboard }) {
  const active = data.activeDocuments
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
      <Tile
        className="xl:col-span-3"
        icon={Package}
        title="Qty on hand"
        value={formatDecimal(data.onHand.qty)}
        footer={`${formatNumber(data.onHand.products)} produk bersaldo, semua satuan dijumlah`}
        href="/inventory/stok"
      />
      <Tile
        className="xl:col-span-3"
        icon={PackageCheck}
        title="Qty tersedia"
        value={formatDecimal(data.available.qty)}
        footer={`${formatNumber(data.available.products)} produk, saldo dikurangi qty dipesan`}
        href="/inventory/stok"
      />
      <Tile
        className="xl:col-span-3"
        icon={PackageX}
        title="Stok habis"
        value={formatNumber(data.outOfStock)}
        footer="Baris saldo per lokasi dengan qty 0"
        href="/inventory/stok"
      />
      <Tile
        className="xl:col-span-3"
        icon={TriangleAlert}
        title="Stok minus"
        value={formatNumber(data.negative)}
        footer="Baris saldo per lokasi dengan qty di bawah 0"
        href="/inventory/stok"
      />
      <Tile
        className="sm:col-span-2 xl:col-span-12"
        icon={FileText}
        title="Dokumen aktif"
        value={formatNumber(active.waiting + active.partial + active.ready)}
        footer={`Menunggu ${formatNumber(active.waiting)} · Sebagian tersedia ${formatNumber(active.partial)} · Siap ${formatNumber(active.ready)}`}
      />
      <Panel
        title="Distribusi stok per gudang"
        className="sm:col-span-2 xl:col-span-12 2xl:col-span-6"
      >
        {data.warehouses.length ? (
          <WarehouseStockChart rows={data.warehouses} />
        ) : (
          <p className="py-10 text-center text-control text-muted-foreground">
            Belum ada stok di gudang yang boleh Anda lihat.
          </p>
        )}
      </Panel>
      <Panel
        title="Transfer aktif terbaru"
        count={`${formatNumber(data.recent.total)} transfer`}
        className="sm:col-span-2 xl:col-span-12 2xl:col-span-6"
      >
        <DataTable
          columns={RECENT_COLUMNS}
          rows={data.recent.rows}
          rowKey={(row) => row.id}
          empty={{ title: "Tidak ada transfer Menunggu, Sebagian tersedia, atau Siap." }}
        />
      </Panel>
    </div>
  )
}
