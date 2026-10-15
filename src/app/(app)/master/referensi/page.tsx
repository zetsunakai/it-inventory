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
import { formatNumber } from "@/lib/format"
import {
  hasActiveFilters,
  parseListParams,
  pickFilter,
  type RawSearchParams,
  pickActive,
  STATUS_FILTER,
  STATUS_OPTIONS,
} from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS, REF_CODE_TYPES } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import {
  listRefCodes,
  summarizeRefCodes,
  type RefCodeRow,
  type RefCodeTypeSummary,
} from "@/server/queries/ref-codes"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Referensi kepabeanan · IT Inventory" }

const TYPE_FILTER = "jenis"

const TYPE_OPTIONS = REF_CODE_TYPES.map((type) => ({
  value: type,
  label: REF_CODE_TYPE_LABELS[type],
}))

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

// Tampilan awal (RM-04): referensi dikelompokkan per jenis; klik jenis untuk melihat isinya.
const SUMMARY_COLUMNS: DataTableColumn<RefCodeTypeSummary>[] = [
  {
    header: "Jenis",
    cell: (row) => (
      <span className="font-medium text-foreground">{REF_CODE_TYPE_LABELS[row.type]}</span>
    ),
    className: "w-full",
  },
  { header: "Aktif", cell: (row) => formatNumber(row.active), align: "right" },
  {
    header: "Diarsipkan",
    cell: (row) => (row.archived ? formatNumber(row.archived) : "—"),
    align: "right",
  },
]

export default function RefCodesPage({ searchParams }: PageProps<"/master/referensi">) {
  return (
    <>
      <PageHeader
        title="Referensi kepabeanan"
        description="Kode resmi untuk dokumen BC. Hanya Administrator yang bisa menambah atau mengubah."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <RefCodeTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function RefCodeTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "ref:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const type = pickFilter(raw, TYPE_FILTER, REF_CODE_TYPES)
  // Tanpa jenis dan kata kunci: ringkasan per jenis. Hasil cari tanpa jenis dikelompokkan per jenis.
  const summary = !type && !hasActiveFilters(raw)
  const [list, summaryRows] = await Promise.all([
    summary ? null : listRefCodes({ active: pickActive(raw), ...params, type }),
    summary ? summarizeRefCodes() : null,
  ])
  const total = list?.total ?? summaryRows?.length ?? 0

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canEdit && (
            <Link href="/master/referensi/baru" className={buttonVariants()}>
              <Plus />
              Tambah referensi
            </Link>
          )
        }
        pager={
          list && (
            <ListPager
              searchParams={raw}
              page={params.page}
              pageSize={params.pageSize}
              total={total}
            />
          )
        }
      >
        <ListSearchBar
          placeholder="Cari kode atau nama"
          filters={[
            { name: TYPE_FILTER, label: "Jenis", options: TYPE_OPTIONS },
            { name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </ListToolbar>
      {summaryRows && (
        <DataTable
          columns={SUMMARY_COLUMNS}
          rows={summaryRows}
          rowKey={(row) => row.type}
          rowHref={(row) => `/master/referensi?${new URLSearchParams({ [TYPE_FILTER]: row.type })}`}
        />
      )}
      {list && (
        <DataTable
          // Kolom Induk hanya untuk jenis yang punya induk (TPS, pelabuhan luar negeri).
          columns={
            type && !REF_CODE_PARENT_TYPES[type]
              ? COLUMNS.filter((column) => column.header !== "Induk")
              : COLUMNS
          }
          rows={list.rows}
          group={
            type
              ? undefined
              : { key: (row) => row.type, label: (row) => REF_CODE_TYPE_LABELS[row.type] }
          }
          rowKey={(row) => row.id}
          rowHref={canEdit ? (row) => `/master/referensi/${row.id}` : undefined}
          rowMuted={(row) => !row.active}
          empty={listEmptyState({
            searchParams: raw,
            basePath: "/master/referensi",
            noun: "referensi",
          })}
        />
      )}
    </div>
  )
}
