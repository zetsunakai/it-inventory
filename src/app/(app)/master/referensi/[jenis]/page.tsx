import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListLayout } from "@/components/layout/list-layout"
import { NameCell } from "@/components/status-badge"
import {
  parseListParams,
  type RawSearchParams,
  pickActive,
  STATUS_FILTER,
  STATUS_OPTIONS,
} from "@/lib/list-params"
import {
  REF_CODE_PARENT_TYPES,
  REF_CODE_TYPE_LABELS,
  refCodeMenuTitle,
  refCodeTypeFromSlug,
  type RefCodeType,
} from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { listRefCodes, type RefCodeRow } from "@/server/queries/ref-codes"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

// Satu daftar per jenis referensi kepabeanan, masing-masing dengan menu sendiri di Master data
// IT Inventory seperti hmx. Hanya baca: tidak ada tombol tambah dan baris tidak membuka form.

export const metadata: Metadata = { title: "Referensi kepabeanan · IT Inventory" }

const COLUMNS: DataTableColumn<RefCodeRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  {
    header: "Induk",
    cell: (row) => {
      const parentType = REF_CODE_PARENT_TYPES[row.type]
      if (!parentType || !row.parentCode) return "—"
      return (
        <span>
          <span className="text-muted-foreground">{REF_CODE_TYPE_LABELS[parentType]} </span>
          <span className="font-mono">{row.parentCode}</span>
        </span>
      )
    },
  },
]

export default function RefCodesPage({
  params,
  searchParams,
}: PageProps<"/master/referensi/[jenis]">) {
  // Parameter route adalah data request (tanpa generateStaticParams), jadi dibaca di balik Suspense.
  return (
    <Suspense fallback={<DataTableSkeleton />}>
      <RefCodeList params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function RefCodeList({
  params,
  searchParams,
}: {
  params: Promise<{ jenis: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const type = refCodeTypeFromSlug((await params).jenis)
  if (!type) notFound()
  return (
    <ListLayout title={refCodeMenuTitle(type)} description="Kode resmi untuk dokumen BC.">
      <RefCodeTable type={type} searchParams={searchParams} />
    </ListLayout>
  )
}

async function RefCodeTable({
  type,
  searchParams,
}: {
  type: RefCodeType
  searchParams: Promise<RawSearchParams>
}) {
  await requirePermission("master:read")
  const raw = await searchParams
  const params = parseListParams(raw)
  const list = await listRefCodes({ active: pickActive(raw), ...params, type })

  return (
    <div className="space-y-4">
      <ListToolbar
        pager={
          <ListPager
            searchParams={raw}
            page={params.page}
            pageSize={params.pageSize}
            total={list.total}
          />
        }
      >
        <ListSearchBar
          placeholder="Cari kode atau nama"
          filters={[{ name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS }]}
        />
      </ListToolbar>
      <DataTable
        // Kolom Induk hanya untuk jenis yang punya induk (TPS, pelabuhan luar negeri).
        columns={
          REF_CODE_PARENT_TYPES[type]
            ? COLUMNS
            : COLUMNS.filter((column) => column.header !== "Induk")
        }
        rows={list.rows}
        rowKey={(row) => row.id}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          noun: "referensi",
        })}
      />
    </div>
  )
}
