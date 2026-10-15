import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { formatDecimal } from "@/lib/decimal"
import { formatDateTime } from "@/lib/format"
import { PRODUCT_TRACKING_LABELS } from "@/lib/inventory"
import { parseListParams, type RawSearchParams } from "@/lib/list-params"
import { requirePermission } from "@/server/auth/session"
import { listLots, type LotRow } from "@/server/queries/lots"

export const metadata: Metadata = { title: "Lot & nomor seri · IT Inventory" }

const PATH = "/inventory/lot"

const COLUMNS: DataTableColumn<LotRow>[] = [
  {
    header: "Lot/seri",
    cell: (row) => <span className="font-mono text-foreground">{row.name}</span>,
  },
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{row.sku}</span>
        <span className="text-muted-foreground">
          {row.productName} · {PRODUCT_TRACKING_LABELS[row.tracking].toLowerCase()}
        </span>
      </span>
    ),
  },
  {
    header: "Stok",
    align: "right",
    cell: (row) => `${formatDecimal(row.qty)} ${row.uomCode}`,
  },
  {
    header: "Terakhir bergerak",
    cell: (row) => (row.lastMovedAt ? formatDateTime(row.lastMovedAt) : "—"),
  },
]

export default function LotsPage({ searchParams }: PageProps<"/inventory/lot">) {
  return (
    <>
      <PageHeader
        title="Lot & nomor seri"
        description="Telusuri dari mana sebuah lot atau nomor seri masuk, ke mana keluar, dan di mana sisanya sekarang."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <LotTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function LotTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("inventory:read")
  const raw = await searchParams
  const params = parseListParams(raw)
  const { rows, total } = await listLots({ ...params, userId: user.id })

  return (
    <div className="space-y-4">
      <DataTableSearch placeholder="Cari nomor lot/seri, SKU, atau nama produk" />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${PATH}/${row.id}`}
        empty={
          raw.q
            ? listEmptyState({ searchParams: raw, basePath: PATH, noun: "lot" })
            : {
                title: "Belum ada lot atau nomor seri yang bergerak.",
                description: "Lot muncul di sini setelah transfer berlot divalidasi.",
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
