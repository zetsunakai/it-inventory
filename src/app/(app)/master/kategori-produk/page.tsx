import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListLayout } from "@/components/layout/list-layout"
import { NameCell } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import {
  parseListParams,
  pickActive,
  type RawSearchParams,
  STATUS_FILTER,
  STATUS_OPTIONS,
} from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { skuExample } from "@/modules/inventory/lib/product-category"
import { requirePermission } from "@/server/auth/session"
import {
  listProductCategories,
  type ProductCategoryRow,
} from "@/modules/inventory/server/queries/product-categories"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

import { deleteProductCategory } from "./actions"

export const metadata: Metadata = { title: "Kategori produk · IT Inventory" }

const COLUMNS: DataTableColumn<ProductCategoryRow>[] = [
  {
    header: "Kategori",
    cell: (row) => (
      // Sub-kategori menjorok di bawah induknya; jalur lengkap tetap terbaca lewat title.
      <span title={row.path} style={{ paddingLeft: `${row.depth * 1.25}rem` }} className="block">
        <NameCell archived={!row.active}>{row.name}</NameCell>
      </span>
    ),
    className: "w-full whitespace-normal",
  },
  {
    header: "Format product code",
    cell: (row) =>
      row.codePrefix ? (
        <span className="font-mono">{skuExample(row.codePrefix, row.codeDigits)}</span>
      ) : (
        <span className="text-muted-foreground">Manual</span>
      ),
  },
  { header: "Produk", cell: (row) => formatNumber(row.productCount), align: "right" },
]

export default function ProductCategoriesPage({
  searchParams,
}: PageProps<"/master/kategori-produk">) {
  return (
    <ListLayout
      title="Kategori produk"
      description="Kategori dengan prefix kode membuat product code otomatis untuk produk baru yang product code-nya dikosongkan."
    >
      <Suspense fallback={<DataTableSkeleton />}>
        <CategoryTable searchParams={searchParams} />
      </Suspense>
    </ListLayout>
  )
}

async function CategoryTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const { rows, total } = await listProductCategories({ ...params, active: pickActive(raw) })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canEdit && (
            <Link href="/master/kategori-produk/baru" className={buttonVariants()}>
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
          placeholder="Cari nama atau prefix kode"
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
                remove: deleteProductCategory,
                noun: "kategori produk",
                id: (row) => row.id,
                label: (row) => row.path,
              }
            : undefined
        }
        rowHref={canEdit ? (row) => `/master/kategori-produk/${row.id}` : undefined}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          noun: "kategori produk",
        })}
      />
    </div>
  )
}
