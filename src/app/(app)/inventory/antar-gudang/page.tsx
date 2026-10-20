import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { formatDecimal } from "@/lib/decimal"
import { formatDate, formatNumber } from "@/lib/format"
import {
  INTERWAREHOUSE_STATUS_LABELS,
  INTERWAREHOUSE_STATUS_TONES,
  INTERWAREHOUSE_STATUSES,
} from "@/modules/inventory/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  listInterwarehouse,
  type InterwarehouseRow,
} from "@/modules/inventory/server/queries/interwarehouse"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

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
    // Barang yang sudah keluar dari gudang asal tapi belum diterima (I-05).
    header: "Di perjalanan",
    align: "right",
    cell: (row) =>
      row.transitProducts === 0
        ? "—"
        : row.transitQty && row.transitUom
          ? `${formatDecimal(row.transitQty)} ${row.transitUom}`
          : `${formatNumber(row.transitProducts)} produk`,
  },
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
  const inTransit = pickFilter(raw, "transit", ["ada"] as const) === "ada"
  const { rows, total } = await listInterwarehouse({
    ...params,
    userId: user.id,
    status,
    inTransit,
  })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canWrite && (
            <Link href={`${PATH}/baru`} className={buttonVariants()}>
              <Plus />
              Buat
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
          placeholder="Cari nomor atau referensi"
          filters={[
            {
              name: "transit",
              label: "Barang",
              options: [{ value: "ada", label: "Masih di perjalanan" }],
            },
            {
              name: "status",
              label: "Status",
              options: INTERWAREHOUSE_STATUSES.map((value) => ({
                value,
                label: INTERWAREHOUSE_STATUS_LABELS[value],
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
        empty={listEmptyState({
          searchParams: raw,
          noun: "transfer antar gudang",
        })}
      />
    </div>
  )
}
