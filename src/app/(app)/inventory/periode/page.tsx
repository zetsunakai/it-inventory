import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { ClosePeriodButton } from "@/components/inventory/close-period-button"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatNumber } from "@/lib/format"
import { requirePermission } from "@/server/auth/session"
import { listPeriods, type PeriodRow } from "@/server/queries/periods"

export const metadata: Metadata = { title: "Tutup periode · IT Inventory" }

const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" })

function periodLabel(row: PeriodRow) {
  return monthName.format(new Date(Date.UTC(row.year, row.month - 1, 15)))
}

export default function PeriodsPage() {
  return (
    <>
      <PageHeader
        title="Tutup periode"
        description="Periode ditutup berurutan setelah bulannya berakhir. Saldo akhir disimpan untuk laporan dan transaksi bertanggal di periode itu ditolak."
      />
      <Suspense fallback={<DataTableSkeleton rows={6} />}>
        <PeriodTable />
      </Suspense>
    </>
  )
}

async function PeriodTable() {
  await requirePermission("inventory:approve")
  const rows = await listPeriods()
  // Hanya periode terbuka paling awal yang sudah berakhir yang bisa ditutup (berurutan).
  const next = [...rows].reverse().find((row) => !row.closedAt && !row.current)

  const columns: DataTableColumn<PeriodRow>[] = [
    {
      header: "Periode",
      className: "w-full",
      cell: (row) => <span className="font-medium text-foreground">{periodLabel(row)}</span>,
    },
    { header: "Pergerakan", align: "right", cell: (row) => formatNumber(row.moveCount) },
    {
      header: "Status",
      cell: (row) =>
        row.closedAt ? (
          <StatusBadge tone="success">Ditutup</StatusBadge>
        ) : row.current ? (
          <StatusBadge tone="info">Berjalan</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Belum ditutup</StatusBadge>
        ),
    },
    {
      header: "Ditutup",
      cell: (row) =>
        row.closedAt ? `${formatDate(row.closedAt)} oleh ${row.closedByName ?? "sistem"}` : "—",
    },
    {
      header: "",
      align: "right",
      cell: (row) =>
        next && row.year === next.year && row.month === next.month ? (
          <ClosePeriodButton year={row.year} month={row.month} label={periodLabel(row)} />
        ) : null,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => `${row.year}-${row.month}`}
      rowMuted={(row) => Boolean(row.closedAt)}
    />
  )
}
