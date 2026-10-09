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
import { NameCell } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatNumber } from "@/lib/format"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listUomCategories, listUoms, type UomRow } from "@/server/queries/uoms"

import { UomCategoryForm } from "./uom-forms"

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
          <h2 className="text-base font-semibold">Kategori satuan</h2>
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
  const { rows, total } = await listUoms({ ...params, categoryId })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari kode atau nama satuan" />
        <DataTableFilter
          name={CATEGORY_FILTER}
          label="Kategori"
          options={categories.map((category) => ({ value: category.id, label: category.name }))}
        />
        {canEdit && (
          <Link href="/master/satuan/baru" className={buttonVariants({ className: "sm:ml-auto" })}>
            <Plus />
            Tambah satuan
          </Link>
        )}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={canEdit ? (row) => `/master/satuan/${row.id}` : undefined}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          basePath: "/master/satuan",
          noun: "satuan",
          create: canEdit ? { href: "/master/satuan/baru", label: "Tambah satuan" } : undefined,
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
