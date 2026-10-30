import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ImportExportActions } from "@/components/import/import-export-actions"
import { Section } from "@/components/layout/section"
import { ListLayout } from "@/components/layout/list-layout"
import { NameCell, StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { LOCATION_TYPE_LABELS } from "@/modules/inventory/lib/inventory"
import {
  hasActiveFilters,
  parseListParams,
  type RawSearchParams,
  pickActive,
  STATUS_FILTER,
  STATUS_OPTIONS,
} from "@/lib/list-params"
import { hasAllWarehouseAccess, hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  listVirtualLocations,
  listWarehouses,
  type LocationRow,
  type WarehouseRow,
} from "@/modules/inventory/server/queries/warehouses"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { WAREHOUSE_LIST_FIELDS } from "@/modules/inventory/server/queries/warehouses"
import { ListPager } from "@/components/data-table/list-pager"

import { deleteWarehouse } from "@/modules/inventory/actions/warehouses"

export const metadata: Metadata = { title: "Gudang & lokasi · IT Inventory" }

const COLUMNS: DataTableColumn<
  WarehouseRow & { locationCount: number; freezingCount: string | null }
>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  { header: "Alamat", cell: (row) => row.address, className: "min-w-64 whitespace-pre-wrap" },
  { header: "Lokasi", cell: (row) => formatNumber(row.locationCount), align: "right" },
  {
    // Gudang yang sedang dibekukan stock opname (I-07); keadaan normal tidak ditandai.
    header: "Opname",
    cell: (row) =>
      row.freezingCount ? (
        <StatusBadge tone="warning" title="Transfer di gudang ini belum bisa divalidasi">
          Beku · {row.freezingCount}
        </StatusBadge>
      ) : null,
  },
]

const VIRTUAL_COLUMNS: DataTableColumn<LocationRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  { header: "Nama", cell: (row) => <NameCell>{row.name}</NameCell>, className: "w-full" },
  { header: "Tipe", cell: (row) => LOCATION_TYPE_LABELS[row.type] },
]

export default function WarehousesPage({ searchParams }: PageProps<"/master/gudang">) {
  return (
    <ListLayout
      title="Gudang & lokasi"
      description="Semua gudang adalah gudang berikat: stok tidak boleh minus di gudang mana pun."
      actions={
        <ImportExportActions
          exportHref="/master/gudang/lokasi/export"
          importHref="/master/gudang/lokasi/import"
          noun="lokasi"
        />
      }
    >
      <Suspense fallback={<DataTableSkeleton />}>
        <WarehouseTable searchParams={searchParams} />
      </Suspense>
      <Section
        title="Lokasi virtual"
        description="Asal dan tujuan pergerakan di luar gudang: dari vendor, ke customer, scrap, dan transit antar gudang."
      >
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <VirtualLocations />
        </Suspense>
      </Section>
    </ListLayout>
  )
}

async function WarehouseTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const { rows, total } = await listWarehouses({
    active: pickActive(raw),
    ...params,
    userId: user.id,
  })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canEdit && (
            <Link href="/master/gudang/baru" className={buttonVariants()}>
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
          fields={WAREHOUSE_LIST_FIELDS}
          placeholder="Cari kode atau nama gudang"
          filters={[{ name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS }]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        selection={
          canEdit
            ? {
                remove: deleteWarehouse,
                noun: "gudang",
                id: (row) => row.id,
                label: (row) => row.code,
              }
            : undefined
        }
        rowHref={(row) => `/master/gudang/${row.id}`}
        rowMuted={(row) => !row.active}
        empty={
          hasActiveFilters(raw) || hasAllWarehouseAccess(user.roles)
            ? listEmptyState({
                searchParams: raw,
                noun: "gudang",
              })
            : {
                title: "Anda belum diberi akses ke gudang mana pun.",
                description: "Minta Administrator memberi akses di halaman Pengguna.",
              }
        }
      />
    </div>
  )
}

async function VirtualLocations() {
  await requirePermission("master:read")
  const rows = await listVirtualLocations()
  return <DataTable columns={VIRTUAL_COLUMNS} rows={rows} rowKey={(row) => row.id} />
}
