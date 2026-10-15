import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableDate } from "@/components/data-table/data-table-date"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import { INVENTORY_CATEGORY_LABELS } from "@/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { requirePermission } from "@/server/auth/session"
import { listAccessibleWarehouses, listStock, type StockRow } from "@/server/queries/stock"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Stok · IT Inventory" }

const WAREHOUSE_FILTER = "gudang"
const DATE_FILTER = "tanggal"

const COLUMNS: DataTableColumn<StockRow>[] = [
  { header: "SKU", cell: (row) => <span className="font-mono text-foreground">{row.sku}</span> },
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-medium text-foreground">{row.productName}</span>
        <span className="text-caption text-muted-foreground">
          {INVENTORY_CATEGORY_LABELS[row.category]}
        </span>
      </span>
    ),
  },
  {
    header: "Lokasi",
    cell: (row) => (
      <span className="font-mono text-caption">
        {row.warehouseCode} · {row.locationPath}
      </span>
    ),
  },
  {
    header: "Lot",
    cell: (row) => (row.lotName ? <span className="font-mono">{row.lotName}</span> : "—"),
  },
  {
    header: "Saldo",
    align: "right",
    cell: (row) => (
      <span className={Number(row.qty) < 0 ? "font-medium text-destructive" : "font-medium"}>
        {formatDecimal(row.qty)} {row.uomCode}
      </span>
    ),
  },
]

// Saldo sekarang juga menampilkan qty yang dipesan transfer terkonfirmasi dan sisanya yang tersedia
// (R-07, R-14). Saldo per tanggal hanya punya saldo.
const RESERVATION_COLUMNS: DataTableColumn<StockRow>[] = [
  {
    header: "Dipesan",
    align: "right",
    cell: (row) => (Number(row.reservedQty) ? formatDecimal(row.reservedQty!) : "—"),
  },
  {
    header: "Tersedia",
    align: "right",
    cell: (row) => formatDecimal((Number(row.qty) - Number(row.reservedQty ?? 0)).toFixed(4)),
  },
]

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())

export default function StockPage({ searchParams }: PageProps<"/inventory/stok">) {
  return (
    <>
      <PageHeader
        title="Stok"
        description="Saldo, qty dipesan transfer yang sudah dikonfirmasi, dan qty tersedia per produk, lokasi, dan lot di gudang yang boleh Anda lihat. Pilih tanggal untuk melihat saldo per akhir hari itu."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <StockTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function StockTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("inventory:read")
  const raw = await searchParams
  const params = parseListParams(raw)
  const warehouses = await listAccessibleWarehouses(user.id)
  const warehouseId = pickFilter(
    raw,
    WAREHOUSE_FILTER,
    warehouses.map((warehouse) => warehouse.id),
  )
  const rawDate = typeof raw[DATE_FILTER] === "string" ? raw[DATE_FILTER] : undefined
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && rawDate <= today() ? rawDate : undefined
  const { rows, total } = await listStock({ ...params, userId: user.id, warehouseId, date })

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
          placeholder="Cari SKU atau nama produk"
          filters={[
            {
              name: WAREHOUSE_FILTER,
              label: "Gudang",
              options: warehouses.map((warehouse) => ({
                value: warehouse.id,
                label: `${warehouse.code} · ${warehouse.name}`,
              })),
            },
          ]}
        />

        <DataTableDate name={DATE_FILTER} label="Saldo per" max={today()} />
      </ListToolbar>
      {date && (
        <p className="text-sm text-muted-foreground">
          Saldo per akhir {formatDate(new Date(`${date}T12:00:00+07:00`))}, dihitung dari riwayat
          pergerakan.
        </p>
      )}
      <DataTable
        columns={date ? COLUMNS : [...COLUMNS, ...RESERVATION_COLUMNS]}
        rows={rows}
        rowKey={(row) => `${row.productId}|${row.locationPath}|${row.lotName ?? ""}`}
        rowHref={(row) => `/inventory/stok/${row.productId}?gudang=${row.warehouseId}`}
        empty={
          raw.q || warehouseId || date
            ? listEmptyState({ searchParams: raw, basePath: "/inventory/stok", noun: "stok" })
            : {
                title: "Belum ada stok.",
                description: "Stok bertambah setelah penerimaan divalidasi.",
              }
        }
      />
    </div>
  )
}
