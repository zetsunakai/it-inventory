import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { NameCell } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatNumber } from "@/lib/format"
import {
  parseListParams,
  pickFilter,
  type RawSearchParams,
  pickActive,
  STATUS_FILTER,
  STATUS_OPTIONS,
} from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listUomCategories, listUoms, type UomRow } from "@/modules/inventory/server/queries/uoms"

import { UomCategoryForm } from "./uom-forms"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

import { deleteUom } from "./actions"

export const metadata: Metadata = { title: "Satuan · IT Inventory" }

const CATEGORY_FILTER = "kategori"

const COLUMNS: DataTableColumn<UomRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full",
  },
  { header: "Kategori", cell: (row) => row.categoryName },
  {
    header: "Berlaku untuk",
    cell: (row) =>
      row.productSku ? (
        <span className="font-mono">{row.productSku}</span>
      ) : (
        <span className="text-muted-foreground">Semua produk</span>
      ),
  },
  {
    header: "Konversi",
    cell: (row) =>
      row.isReference ? (
        <span className="text-muted-foreground">Satuan acuan</span>
      ) : (
        <span>
          1 {row.code} = {formatDecimal(row.factor)} {row.referenceCode}
        </span>
      ),
  },
]

export default function UomsPage({ searchParams }: PageProps<"/master/satuan">) {
  return (
    <>
      <PageHeader
        title="Satuan"
        description="Konversi hanya berlaku antar satuan dalam kategori yang sama."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <UomTable searchParams={searchParams} />
      </Suspense>
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Kategori satuan</h2>
          <p className="text-sm text-muted-foreground">
            Setiap kategori punya satu satuan acuan dengan faktor 1.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <Categories />
        </Suspense>
      </section>
    </>
  )
}

async function UomTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const categories = await listUomCategories()
  const categoryId = pickFilter(
    raw,
    CATEGORY_FILTER,
    categories.map((category) => category.id),
  )
  const { rows, total } = await listUoms({ ...params, categoryId, active: pickActive(raw) })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canEdit && (
            <Link href="/master/satuan/baru" className={buttonVariants()}>
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
          placeholder="Cari kode, nama satuan, atau product code"
          filters={[
            {
              name: CATEGORY_FILTER,
              label: "Kategori",
              options: categories.map((category) => ({ value: category.id, label: category.name })),
            },
            { name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        bulkDelete={
          canEdit
            ? { action: deleteUom, noun: "satuan", id: (row) => row.id, label: (row) => row.code }
            : undefined
        }
        rowHref={canEdit ? (row) => `/master/satuan/${row.id}` : undefined}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          noun: "satuan",
        })}
      />
    </div>
  )
}

type CategoryRow = Awaited<ReturnType<typeof listUomCategories>>[number]

const CATEGORY_COLUMNS: DataTableColumn<CategoryRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono">{row.code}</span> },
  { header: "Nama", cell: (row) => row.name },
  {
    header: "Satuan acuan",
    cell: (row) => (row.referenceCode ? `${row.referenceCode} · ${row.referenceName}` : "—"),
  },
  { header: "Jumlah satuan", cell: (row) => formatNumber(row.uomCount), align: "right" },
]

async function Categories() {
  const user = await requirePermission("master:read")
  const categories = await listUomCategories()
  return (
    <div className="space-y-4">
      <DataTable columns={CATEGORY_COLUMNS} rows={categories} rowKey={(row) => row.id} />
      {hasPermission(user.roles, "master:write") && <UomCategoryForm />}
    </div>
  )
}
