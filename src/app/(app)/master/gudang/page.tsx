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
import { NameCell, StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  LOCATION_TYPE_LABELS,
} from "@/lib/inventory"
import {
  hasActiveFilters,
  parseListParams,
  pickFilter,
  type RawSearchParams,
} from "@/lib/list-params"
import { hasAllWarehouseAccess, hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  listVirtualLocations,
  listWarehouses,
  type LocationRow,
  type WarehouseRow,
} from "@/server/queries/warehouses"

export const metadata: Metadata = { title: "Gudang & lokasi · IT Inventory" }

const CATEGORY_FILTER = "kategori"

const CATEGORY_OPTIONS = INVENTORY_CATEGORIES.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}))

const COLUMNS: DataTableColumn<WarehouseRow & { locationCount: number }>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  {
    header: "Berikat",
    cell: (row) => (row.isBonded ? <StatusBadge tone="bonded">Berikat</StatusBadge> : "—"),
  },
  { header: "Kategori", cell: (row) => INVENTORY_CATEGORY_LABELS[row.category] },
  { header: "Lokasi", cell: (row) => formatNumber(row.locationCount), align: "right" },
]

const VIRTUAL_COLUMNS: DataTableColumn<LocationRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  { header: "Nama", cell: (row) => <NameCell>{row.name}</NameCell>, className: "w-full" },
  { header: "Tipe", cell: (row) => LOCATION_TYPE_LABELS[row.type] },
]

export default function WarehousesPage({ searchParams }: PageProps<"/master/gudang">) {
  return (
    <>
      <PageHeader
        title="Gudang & lokasi"
        description="Gudang berikat mewajibkan dokumen BC untuk setiap pergerakan barang."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <WarehouseTable searchParams={searchParams} />
      </Suspense>
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Lokasi virtual</h2>
          <p className="text-sm text-muted-foreground">
            Asal dan tujuan pergerakan di luar gudang: dari vendor, ke customer, scrap, dan
            penyesuaian stok.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <VirtualLocations />
        </Suspense>
      </section>
    </>
  )
}

async function WarehouseTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const category = pickFilter(raw, CATEGORY_FILTER, INVENTORY_CATEGORIES)
  const { rows, total } = await listWarehouses({ ...params, category, userId: user.id })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari kode atau nama gudang" />
        <DataTableFilter name={CATEGORY_FILTER} label="Kategori" options={CATEGORY_OPTIONS} />
        {canEdit && (
          <Link href="/master/gudang/baru" className={buttonVariants({ className: "sm:ml-auto" })}>
            <Plus />
            Tambah gudang
          </Link>
        )}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/master/gudang/${row.id}`}
        rowMuted={(row) => !row.active}
        empty={
          hasActiveFilters(raw) || hasAllWarehouseAccess(user.roles)
            ? listEmptyState({
                searchParams: raw,
                basePath: "/master/gudang",
                noun: "gudang",
                create: canEdit
                  ? { href: "/master/gudang/baru", label: "Tambah gudang" }
                  : undefined,
              })
            : {
                title: "Anda belum diberi akses ke gudang mana pun.",
                description: "Minta Administrator memberi akses di halaman detail gudang.",
              }
        }
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

async function VirtualLocations() {
  await requirePermission("master:read")
  const rows = await listVirtualLocations()
  return <DataTable columns={VIRTUAL_COLUMNS} rows={rows} rowKey={(row) => row.id} />
}
