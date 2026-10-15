import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { formatDate, formatNumber } from "@/lib/format"
import {
  INTERWAREHOUSE_STATUS_LABELS,
  INTERWAREHOUSE_STATUS_TONES,
  INTERWAREHOUSE_STATUSES,
} from "@/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listInterwarehouse, type InterwarehouseRow } from "@/server/queries/interwarehouse"

export const metadata: Metadata = { title: "Transfer antar gudang · IT Inventory" }

const PATH = "/inventory/antar-gudang"

const COLUMNS: DataTableColumn<InterwarehouseRow>[] = [
  {
    header: "Nomor",
    cell: (row) => <span className="font-mono text-foreground">{row.number}</span>,
  },
  {
    header: "Dari → ke",
    className: "w-full",
    cell: (row) => (
      <span className="font-mono text-caption">
        {row.sourceWarehouse} → {row.destinationWarehouse}
      </span>
    ),
  },
  { header: "Referensi", cell: (row) => row.reference ?? "—" },
  {
    header: "Tanggal",
    cell: (row) =>
      row.scheduledDate ? formatDate(new Date(`${row.scheduledDate}T00:00:00+07:00`)) : "—",
  },
  { header: "Baris", align: "right", cell: (row) => formatNumber(row.lineCount) },
  {
    header: "Status",
    cell: (row) => (
      <StatusBadge tone={INTERWAREHOUSE_STATUS_TONES[row.status]}>
        {INTERWAREHOUSE_STATUS_LABELS[row.status]}
      </StatusBadge>
    ),
  },
]

export default function InterwarehousePage({ searchParams }: PageProps<"/inventory/antar-gudang">) {
  return (
    <>
      <PageHeader
        title="Transfer antar gudang"
        description="Barang keluar dari gudang asal ke lokasi transit, lalu masuk ke gudang tujuan. Selama di jalan, barang tidak tercatat di stok gudang mana pun."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <InterwarehouseTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function InterwarehouseTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("inventory:read")
  const canWrite = hasPermission(user.roles, "inventory:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const status = pickFilter(raw, "status", INTERWAREHOUSE_STATUSES)
  const { rows, total } = await listInterwarehouse({ ...params, userId: user.id, status })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari nomor atau referensi" />
        <DataTableFilter
          name="status"
          label="Status"
          options={INTERWAREHOUSE_STATUSES.map((value) => ({
            value,
            label: INTERWAREHOUSE_STATUS_LABELS[value],
          }))}
        />
        {canWrite && (
          <Link href={`${PATH}/baru`} className={buttonVariants({ className: "sm:ml-auto" })}>
            <Plus />
            Buat permintaan
          </Link>
        )}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${PATH}/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({
          searchParams: raw,
          basePath: PATH,
          noun: "transfer antar gudang",
          create: canWrite ? { href: `${PATH}/baru`, label: "Buat permintaan" } : undefined,
        })}
      />
      <DataTablePagination
        searchParams={raw}
        page={params.page}
        pageSize={params.pageSize}
        total={total}
      />
    </div>
  )
}
