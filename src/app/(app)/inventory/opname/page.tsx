import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { CountStatusBadge } from "@/modules/inventory/components/count-status"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { formatDateTime, formatNumber } from "@/lib/format"
import { STOCK_COUNT_STATUS_LABELS, STOCK_COUNT_STATUSES } from "@/modules/inventory/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  listStockCounts,
  type StockCountRow,
} from "@/modules/inventory/server/queries/stock-counts"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Stock opname · IT Inventory" }

const STATUS_FILTER = "status"

const COLUMNS: DataTableColumn<StockCountRow>[] = [
  {
    header: "Nomor",
    cell: (row) => <span className="font-mono text-foreground">{row.number}</span>,
  },
  {
    header: "Lingkup",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium text-foreground">
          {row.warehouseCode} · {row.warehouseName}
        </span>
        <span className="font-mono text-caption text-muted-foreground">
          {row.locationPath ?? "Seluruh gudang"}
        </span>
      </span>
    ),
  },
  {
    header: "Mulai hitung",
    cell: (row) => (row.status === "draft" ? "—" : formatDateTime(row.cutOffAt)),
  },
  {
    header: "Dihitung",
    align: "right",
    cell: (row) => `${formatNumber(row.countedCount)}/${formatNumber(row.lineCount)}`,
  },
  { header: "Status", cell: (row) => <CountStatusBadge status={row.status} /> },
]

export default function StockCountsPage({ searchParams }: PageProps<"/inventory/opname">) {
  return (
    <>
      <PageHeader
        title="Stock opname"
        description="Hitung fisik per gudang atau lokasi. Selama opname berjalan gudangnya dibekukan; selisih yang disetujui Manajer menjadi penyesuaian stok."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <StockCountTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function StockCountTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("inventory:read")
  const canCreate = hasPermission(user.roles, "inventory:approve")
  const raw = await searchParams
  const params = parseListParams(raw)
  const status = pickFilter(raw, STATUS_FILTER, STOCK_COUNT_STATUSES)
  const { rows, total } = await listStockCounts({ ...params, userId: user.id, status })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canCreate && (
            <Link href="/inventory/opname/baru" className={buttonVariants()}>
              <Plus />
              Buat sesi opname
            </Link>
          )
        }
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
          placeholder="Cari nomor atau gudang"
          filters={[
            {
              name: STATUS_FILTER,
              label: "Status",
              options: STOCK_COUNT_STATUSES.map((value) => ({
                value,
                label: STOCK_COUNT_STATUS_LABELS[value],
              })),
            },
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/inventory/opname/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({
          searchParams: raw,
          noun: "sesi opname",
        })}
      />
    </div>
  )
}
