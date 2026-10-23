import { FileSpreadsheet, FileText, Plus } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListPager } from "@/components/data-table/list-pager"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { NewRecordLayout } from "@/components/document/new-record-layout"
import { StatusSteps } from "@/components/document/status-steps"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { RecordModes } from "@/components/layout/record-modes"
import { ListLayout } from "@/components/layout/list-layout"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  CUSTOMS_DOCUMENT_STATUS_TONES,
  CUSTOMS_DOCUMENT_STATUSES,
  CUSTOMS_PERIOD_LABELS,
  CUSTOMS_PERIODS,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import type { CustomsFormSpec } from "@/modules/it-inventory/lib/customs-form"
import {
  customsOfficeOptions,
  getCustomsDocument,
  listCustomsDocuments,
  newCustomsDraft,
  requiredCustomsSpec,
  type CustomsDocumentRow,
} from "@/modules/it-inventory/server/queries/customs-documents"
import {
  deleteCustomsDocument,
  duplicateCustomsDocument,
} from "@/modules/it-inventory/actions/customs-documents"
import { requirePermission } from "@/server/auth/session"
import { recordActivity, statusDates } from "@/server/queries/activity"

import { SubmitCustomsButton } from "./customs-document-actions"
import { CustomsDocumentForm } from "./customs-document-form"
import { CustomsDocumentView } from "./customs-document-view"
import { DocumentTransfersSection } from "./document-transfers-section"

// Halaman daftar, buat, dan detail dokumen BC, sama untuk semua jenis (M3-04). Halaman di
// src/app/(app)/dokumen-bc/<jenis>/ hanya meneruskan spec jenisnya (M3-05–M3-09).

export function customsStatusBadge(status: CustomsDocumentStatus) {
  return (
    <StatusBadge tone={CUSTOMS_DOCUMENT_STATUS_TONES[status]}>
      {CUSTOMS_DOCUMENT_STATUS_LABELS[status]}
    </StatusBadge>
  )
}

const wibDate = (value: string) => formatDate(new Date(`${value}T00:00:00+07:00`))

// Kolom daftar seperti list view hmx (backlog H-01): IT Inventory document sequence, No. Aju,
// No. Daftar, Tgl. Daftar, kantor pengawas, status.
const COLUMNS: DataTableColumn<CustomsDocumentRow>[] = [
  {
    header: "Nomor",
    cell: (row) => <span className="font-mono text-foreground">{row.number}</span>,
  },
  {
    header: "No. Aju",
    cell: (row) => (row.ajuNumber ? <span className="font-mono">{row.ajuNumber}</span> : "—"),
  },
  {
    header: "No. Daftar",
    cell: (row) =>
      row.registrationNumber ? <span className="font-mono">{row.registrationNumber}</span> : "—",
  },
  {
    header: "Tgl. Daftar",
    cell: (row) => (row.registrationDate ? wibDate(row.registrationDate) : "—"),
  },
  {
    header: "Kantor Pabean Pengawasan",
    cell: (row) => (row.officeCode ? `[${row.officeCode}] ${row.officeName ?? ""}`.trim() : "—"),
  },
  { header: "Status", cell: (row) => customsStatusBadge(row.status) },
]

export function CustomsListPage({
  spec,
  searchParams,
}: {
  spec: CustomsFormSpec
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <ListLayout
      title={spec.title}
      description={spec.description}
      actions={
        <Suspense fallback={null}>
          <CustomsListDownloads spec={spec} searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<DataTableSkeleton />}>
        <CustomsTable spec={spec} searchParams={searchParams} />
      </Suspense>
    </ListLayout>
  )
}

async function CustomsListDownloads({
  spec,
  searchParams,
}: {
  spec: CustomsFormSpec
  searchParams: Promise<RawSearchParams>
}) {
  await requirePermission("bc:read")
  const raw = await searchParams
  const query = new URLSearchParams({ docCode: spec.code })
  for (const key of ["q", "status", "periode", "kantor"]) {
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

async function CustomsTable({
  spec,
  searchParams,
}: {
  spec: CustomsFormSpec
  searchParams: Promise<RawSearchParams>
}) {
  const user = await requirePermission("bc:read")
  const canWrite = hasPermission(user.roles, "bc:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const status = pickFilter(raw, "status", CUSTOMS_DOCUMENT_STATUSES)
  const period = pickFilter(raw, "periode", CUSTOMS_PERIODS)
  const offices = await customsOfficeOptions(spec.code)
  const officeCode = pickFilter(
    raw,
    "kantor",
    offices.map((office) => office.value),
  )
  const { rows, total } = await listCustomsDocuments({
    ...params,
    docCode: spec.code,
    status,
    officeCode,
    period,
  })

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canWrite && (
            <Link href={`${spec.path}/baru`} className={buttonVariants()}>
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
          placeholder="Cari nomor, No. Aju, No. Daftar, atau partner"
          filters={[
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
        rowHref={(row) => `${spec.path}/${row.id}`}
        selection={
          canWrite
            ? {
                noun: "dokumen",
                id: (row) => row.id,
                label: (row) => row.number,
                remove: deleteCustomsDocument,
                removeNote:
                  "Hanya dokumen Draft; dokumen Submitted ditolak. Dokumen beserta barang, lampiran, dan pilihan transfernya dihapus permanen.",
                duplicate: duplicateCustomsDocument,
                duplicatePath: spec.path,
              }
            : undefined
        }
        empty={listEmptyState({
          searchParams: raw,
          noun: `dokumen ${spec.title}`,
        })}
      />
    </div>
  )
}

export function NewCustomsDocumentPage({ spec }: { spec: CustomsFormSpec }) {
  return (
    <NewRecordLayout
      title={`Buat ${spec.title}`}
      hideTitle
      description="Disimpan sebagai Draft dengan nomor urut baru."
      noun="dokumen"
      status={<StatusSteps steps={STEPS} current="draft" />}
    >
      <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
        <NewCustomsForm spec={spec} />
      </Suspense>
    </NewRecordLayout>
  )
}

async function NewCustomsForm({ spec }: { spec: CustomsFormSpec }) {
  const user = await requirePermission("bc:write")
  const [formSpec, { draft, refLabels, companyReady, companyName }] = await Promise.all([
    requiredCustomsSpec(spec),
    newCustomsDraft(spec, user.name),
  ])
  return (
    <div className="space-y-4">
      {!companyReady && (
        <p role="alert" className="rounded-lg bg-warning-soft p-3 text-control">
          Profil perusahaan belum diisi, jadi entitas perusahaan belum bisa diisi otomatis.{" "}
          <Link href="/master/perusahaan" className="font-medium underline underline-offset-4">
            Isi profil perusahaan
          </Link>
        </p>
      )}
      <CustomsDocumentForm
        spec={formSpec}
        companyName={companyName}
        initial={draft}
        initialLabels={refLabels}
      />
    </div>
  )
}

export function CustomsDocumentDetailPage({
  spec,
  params,
}: {
  spec: CustomsFormSpec
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
      <CustomsDetail spec={spec} params={params} />
    </Suspense>
  )
}

// Status seperti statusbar form hmx: Draft → Submitted.
const STEPS = [
  { code: "draft", label: "Draft" },
  { code: "submitted", label: "Submitted" },
]

async function CustomsDetail({
  spec,
  params,
}: {
  spec: CustomsFormSpec
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("bc:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const doc = await getCustomsDocument(spec, id)
  if (!doc) notFound()
  const [activity, dates] = await Promise.all([
    recordActivity("customs_documents", doc.id, CUSTOMS_ACTIVITY_LABELS),
    statusDates("customs_documents", doc.id),
  ])
  const formSpec = await requiredCustomsSpec(spec)
  const canWrite = hasPermission(user.roles, "bc:write")
  const editable = canWrite && doc.status === "draft"

  return (
    <DocumentLayout
      title={`${spec.title} ${doc.number}`}
      hideTitle
      crumbs={[{ label: doc.number }]}
      meta={
        [
          doc.ajuNumber && `No. Aju ${doc.ajuNumber}`,
          doc.registrationNumber && `No. Daftar ${doc.registrationNumber}`,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      }
      status={<StatusSteps steps={STEPS} current={doc.status} dates={dates} />}
      activity={<ActivityLog entries={activity} noun="dokumen" />}
    >
      <div className="space-y-4">
        {/* Draft dibuka dalam mode baca seperti hmx; Edit membuka form, Simpan/Buang kembali. */}
        <RecordModes
          key={doc.id}
          canEdit={editable}
          createHref={`${spec.path}/baru`}
          view={
            // Tabel transfer (status, tanggal selesai) hanya di mode baca: saat Edit pilihan
            // transfer ada di header form dan belum tersimpan.
            <div className="flex flex-col gap-6">
              <CustomsDocumentView
                spec={spec}
                number={doc.number}
                companyName={doc.companyName}
                draft={doc.draft}
                refLabels={doc.refLabels}
              />
              <DocumentTransfersSection documentId={doc.id} />
            </div>
          }
          actions={
            // Elemen dari server masuk ke daftar anak di klien; tanpa key React memperingatkan
            // "unique key" karena elemen hasil RSC belum ditandai tervalidasi.
            <SubmitCustomsButton key="submit" id={doc.id} number={doc.number} />
          }
          form={
            editable && (
              <CustomsDocumentForm
                spec={formSpec}
                documentId={doc.id}
                number={doc.number}
                companyName={doc.companyName}
                initial={doc.draft}
                initialLabels={doc.refLabels}
                actions={<SubmitCustomsButton key="submit" id={doc.id} number={doc.number} />}
              />
            )
          }
        />
      </div>
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const CUSTOMS_ACTIVITY_LABELS = {
  fields: {
    status: "Status",
    customs_office_code: "Kantor pabean",
    registration_number: "No. Daftar",
    registration_date: "Tgl. Daftar",
    aju_number: "No. Aju",
    currency_code: "Valuta",
    ndpbm: "NDPBM",
    cif_value: "Nilai CIF",
    fob_value: "Nilai FOB",
    delivery_price: "Harga penyerahan",
    gross_weight: "Berat kotor",
    net_weight: "Berat bersih",
    signer_name: "Penandatangan",
    notes: "Catatan",
    submitted_at: "Tanggal Submit",
  },
  values: { status: CUSTOMS_DOCUMENT_STATUS_LABELS as Record<string, string> },
}
