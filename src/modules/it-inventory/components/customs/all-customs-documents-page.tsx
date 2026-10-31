import { FileSpreadsheet, FileText } from "lucide-react"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListPager } from "@/components/data-table/list-pager"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListLayout } from "@/components/layout/list-layout"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { buttonVariants } from "@/components/ui/button"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_DOCUMENT_STATUSES,
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  CUSTOMS_PERIODS,
  CUSTOMS_PERIOD_LABELS,
} from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import {
  CUSTOMS_LIST_FIELDS,
  customsOfficeOptions,
  listCustomsDocuments,
  type CustomsDocumentRow,
} from "@/modules/it-inventory/server/queries/customs-documents"
import {
  deleteCustomsDocument,
  duplicateCustomsDocument,
} from "@/modules/it-inventory/actions/customs-documents"
import { requirePermission } from "@/server/auth/session"

import { CUSTOMS_COLUMNS } from "./customs-document-pages"
import { NewCustomsDocumentDialog } from "./new-customs-document-dialog"

const COLUMNS: DataTableColumn<CustomsDocumentRow>[] = [
  CUSTOMS_COLUMNS[0],
  { header: "Jenis dokumen", cell: (row) => CUSTOMS_DOC_CODE_LABELS[row.docCode] },
  ...CUSTOMS_COLUMNS.slice(1),
]

export function AllCustomsDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <ListLayout
      title="Daftar dokumen"
      actions={
        <Suspense fallback={null}>
          <Downloads searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<DataTableSkeleton />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </ListLayout>
  )
}

async function Downloads({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePermission("bc:read")
  const raw = await searchParams
  const query = new URLSearchParams()
  for (const key of ["q", "docCode", "status", "periode", "kantor", "filter"]) {
    const value = raw[key]
    const single = Array.isArray(value) ? value[0] : value
    if (single) query.set(key, single)
  }
  const href = (format: string) => `/api/customs-documents/export?${query}&format=${format}`
  return (
    <>
      <a href={href("pdf")} download className={buttonVariants({ variant: "outline" })}>
        <FileText />
        Unduh PDF
      </a>
      <a href={href("xlsx")} download className={buttonVariants({ variant: "outline" })}>
        <FileSpreadsheet />
        Unduh Excel
      </a>
    </>
  )
}

async function Table({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("bc:read")
  const canWrite = hasPermission(user.roles, "bc:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const docCode = pickFilter(raw, "docCode", CUSTOMS_DOC_CODES)
  const status = pickFilter(raw, "status", CUSTOMS_DOCUMENT_STATUSES)
  const period = pickFilter(raw, "periode", CUSTOMS_PERIODS)
  const offices = await customsOfficeOptions(docCode)
  const officeCode = pickFilter(
    raw,
    "kantor",
    offices.map((office) => office.value),
  )
  const { rows, total } = await listCustomsDocuments({
    ...params,
    docCode,
    status,
    officeCode,
    period,
  })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={canWrite && <NewCustomsDocumentDialog />}
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
          fields={CUSTOMS_LIST_FIELDS}
          placeholder="Cari nomor, No. Aju, No. Daftar, atau partner"
          filters={[
            {
              name: "docCode",
              label: "Jenis dokumen",
              options: CUSTOMS_DOC_CODES.map((value) => ({
                value,
                label: CUSTOMS_DOC_CODE_LABELS[value],
              })),
            },
            {
              name: "status",
              label: "Status",
              options: CUSTOMS_DOCUMENT_STATUSES.map((value) => ({
                value,
                label: CUSTOMS_DOCUMENT_STATUS_LABELS[value],
              })),
            },
            {
              name: "periode",
              label: "Tanggal dibuat",
              options: CUSTOMS_PERIODS.map((value) => ({
                value,
                label: CUSTOMS_PERIOD_LABELS[value],
              })),
            },
            ...(offices.length > 1
              ? [{ name: "kantor", label: "Kantor pabean", options: offices }]
              : []),
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${CUSTOMS_SPECS[row.docCode].path}/${row.id}`}
        selection={
          canWrite
            ? {
                noun: "dokumen",
                id: (row) => row.id,
                label: (row) => row.number,
                remove: deleteCustomsDocument,
                removeNote: "Hanya dokumen Draft; dokumen Submitted ditolak.",
                duplicate: duplicateCustomsDocument,
                duplicatePath: Object.fromEntries(
                  rows.map((row) => [row.id, CUSTOMS_SPECS[row.docCode].path]),
                ),
              }
            : undefined
        }
        empty={listEmptyState({ searchParams: raw, noun: "dokumen" })}
      />
    </div>
  )
}
