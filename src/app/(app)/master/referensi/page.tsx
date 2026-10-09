import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS, REF_CODE_TYPES } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { listRefCodes, type RefCodeRow } from "@/server/queries/ref-codes"

export const metadata: Metadata = { title: "Referensi kepabeanan · IT Inventory" }

const TYPE_FILTER = "jenis"

const TYPE_OPTIONS = REF_CODE_TYPES.map((type) => ({
  value: type,
  label: REF_CODE_TYPE_LABELS[type],
}))

function columns(canEdit: boolean): DataTableColumn<RefCodeRow>[] {
  const base: DataTableColumn<RefCodeRow>[] = [
    { header: "Jenis", cell: (row) => REF_CODE_TYPE_LABELS[row.type] },
    { header: "Kode", cell: (row) => <span className="font-mono">{row.code}</span> },
    { header: "Nama", cell: (row) => row.name, className: "whitespace-normal" },
    {
      header: "Induk",
      cell: (row) => {
        const parentType = REF_CODE_PARENT_TYPES[row.type]
        if (!parentType || !row.parentCode) return <span className="text-muted-foreground">—</span>
        return (
          <span>
            {REF_CODE_TYPE_LABELS[parentType]} <span className="font-mono">{row.parentCode}</span>
          </span>
        )
      },
    },
    {
      header: "Status",
      cell: (row) =>
        row.active ? (
          <Badge variant="secondary">Aktif</Badge>
        ) : (
          <Badge variant="outline">Arsip</Badge>
        ),
    },
  ]
  if (!canEdit) return base
  return [
    ...base,
    {
      header: "Aksi",
      className: "text-right",
      cell: (row) => (
        <Link
          href={`/master/referensi/${row.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Ubah ${row.code}`}
        >
          Ubah
        </Link>
      ),
    },
  ]
}

export default function RefCodesPage({ searchParams }: PageProps<"/master/referensi">) {
  return (
    <>
      <PageHeader
        title="Referensi kepabeanan"
        description="Kode resmi yang dipakai di dokumen BC. Hanya Administrator yang bisa menambah atau mengubah."
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
  const { rows, total } = await listRefCodes({ ...params, type })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari kode atau nama" />
        <DataTableFilter name={TYPE_FILTER} label="Jenis" options={TYPE_OPTIONS} />
        {canEdit && (
          <Link
            href="/master/referensi/baru"
            className={buttonVariants({ className: "sm:ml-auto" })}
          >
            <Plus />
            Tambah referensi
          </Link>
        )}
      </div>
      <DataTable
        columns={columns(canEdit)}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="Tidak ada referensi yang cocok."
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
