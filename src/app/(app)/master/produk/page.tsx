import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ImportExportActions } from "@/components/import/import-export-actions"
import { PageHeader } from "@/components/page-header"
import { NameCell } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { INVENTORY_CATEGORIES, INVENTORY_CATEGORY_LABELS } from "@/lib/inventory"
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
import { listProducts, type ProductRow } from "@/server/queries/products"

import { CustomsReadiness } from "./customs-readiness"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Produk · IT Inventory" }

const CATEGORY_FILTER = "kategori"
const READINESS_FILTER = "dokumen-bc"
const READINESS_OPTIONS = [
  { value: "siap", label: "Siap dokumen BC" },
  { value: "belum", label: "Belum siap dokumen BC" },
]

const COLUMNS: DataTableColumn<ProductRow>[] = [
  { header: "SKU", cell: (row) => <span className="font-mono text-foreground">{row.sku}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  { header: "Kategori", cell: (row) => INVENTORY_CATEGORY_LABELS[row.category] },
  { header: "Satuan", cell: (row) => row.uomCode },
  {
    header: "Kode HS",
    cell: (row) => (row.hsCode ? <span className="font-mono">{row.hsCode}</span> : "—"),
  },
  { header: "Dokumen BC", cell: (row) => <CustomsReadiness product={row} /> },
]

export default function ProductsPage({ searchParams }: PageProps<"/master/produk">) {
  return (
    <>
      <PageHeader
        title="Produk"
        description="Produk tanpa kode HS atau satuan CEISA belum bisa dipakai di dokumen BC."
        actions={
          <ImportExportActions
            exportHref="/master/produk/export"
            importHref="/master/produk/import"
          />
        }
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <ProductTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function ProductTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const category = pickFilter(raw, CATEGORY_FILTER, INVENTORY_CATEGORIES)
  const readiness = pickFilter(raw, READINESS_FILTER, ["siap", "belum"] as const)
  const { rows, total } = await listProducts({
    active: pickActive(raw),
    ...params,
    category,
    customsReady: readiness === undefined ? undefined : readiness === "siap",
  })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canEdit && (
            <Link href="/master/produk/baru" className={buttonVariants()}>
              <Plus />
              Tambah produk
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
          placeholder="Cari SKU, nama, atau kode HS"
          filters={[
            {
              name: CATEGORY_FILTER,
              label: "Kategori",
              options: INVENTORY_CATEGORIES.map((value) => ({
                value,
                label: INVENTORY_CATEGORY_LABELS[value],
              })),
            },
            { name: READINESS_FILTER, label: "Dokumen BC", options: READINESS_OPTIONS },
            { name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/master/produk/${row.id}`}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          basePath: "/master/produk",
          noun: "produk",
          create: canEdit ? { href: "/master/produk/baru", label: "Tambah produk" } : undefined,
        })}
      />
    </div>
  )
}
