import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListLayout } from "@/components/layout/list-layout"
import { StatusBadge } from "@/components/status-badge"
import { formatDate, formatNumber } from "@/lib/format"
import {
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_STATUS_TONES,
  RETURN_REQUEST_STATUSES,
  RETURN_REQUEST_TYPE_LABELS,
  RETURN_REQUEST_TYPES,
} from "@/modules/inventory/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { requirePermission } from "@/server/auth/session"
import {
  listReturnRequests,
  type ReturnRequestRow,
} from "@/modules/inventory/server/queries/return-requests"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { RETURN_LIST_FIELDS } from "@/modules/inventory/server/queries/return-requests"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Retur · IT Inventory" }

const PATH = "/inventory/retur"

const COLUMNS: DataTableColumn<ReturnRequestRow>[] = [
  {
    header: "Nomor",
    cell: (row) => <span className="font-mono text-foreground">{row.number}</span>,
  },
  { header: "Jenis", cell: (row) => RETURN_REQUEST_TYPE_LABELS[row.type] },
  {
    header: "Partner",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="text-foreground">{row.partnerName}</span>
        <span className="font-mono text-caption text-muted-foreground">
          {row.originNumber} · {row.warehouseCode}
        </span>
      </span>
    ),
  },
  {
    header: "Tanggal",
    cell: (row) =>
      row.scheduledDate ? formatDate(new Date(`${row.scheduledDate}T00:00:00+07:00`)) : "—",
  },
  { header: "Baris", align: "right", cell: (row) => formatNumber(row.lineCount) },
  {
    header: "Status",
    cell: (row) => (
      <StatusBadge tone={RETURN_REQUEST_STATUS_TONES[row.status]}>
        {RETURN_REQUEST_STATUS_LABELS[row.status]}
      </StatusBadge>
    ),
  },
]

export default function ReturnRequestsPage({ searchParams }: PageProps<"/inventory/retur">) {
  return (
    <ListLayout
      title="Retur"
      description="Retur ke vendor dari penerimaan, atau dari customer dari pengiriman, yang sudah Selesai. Buat retur dari halaman transfer asalnya."
    >
      <Suspense fallback={<DataTableSkeleton />}>
        <ReturnRequestTable searchParams={searchParams} />
      </Suspense>
    </ListLayout>
  )
}

async function ReturnRequestTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("inventory:read")
  const raw = await searchParams
  const params = parseListParams(raw)
  const status = pickFilter(raw, "status", RETURN_REQUEST_STATUSES)
  const type = pickFilter(raw, "jenis", RETURN_REQUEST_TYPES)
  const { rows, total } = await listReturnRequests({ ...params, userId: user.id, status, type })

  return (
    <div className="space-y-4">
      <ListToolbar
        pager={
          <ListPager
            searchParams={raw}
            page={params.page}
            pageSize={params.pageSize}
            total={total}
          />
        }
      >
        <ListSearchBar
          fields={RETURN_LIST_FIELDS}
          placeholder="Cari nomor, transfer asal, atau partner"
          filters={[
            {
              name: "jenis",
              label: "Jenis",
              options: RETURN_REQUEST_TYPES.map((value) => ({
                value,
                label: RETURN_REQUEST_TYPE_LABELS[value],
              })),
            },
            {
              name: "status",
              label: "Status",
              options: RETURN_REQUEST_STATUSES.map((value) => ({
                value,
                label: RETURN_REQUEST_STATUS_LABELS[value],
              })),
            },
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${PATH}/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({ searchParams: raw, noun: "retur" })}
      />
    </div>
  )
}
