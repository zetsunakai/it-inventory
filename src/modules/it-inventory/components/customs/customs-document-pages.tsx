import { Plus } from "lucide-react"
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
import { StatusSteps } from "@/components/document/status-steps"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { Section } from "@/components/layout/section"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatDateTime, formatNumber } from "@/lib/format"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  CUSTOMS_DOCUMENT_STATUS_TONES,
  CUSTOMS_DOCUMENT_STATUSES,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import type { CustomsFormSpec } from "@/modules/it-inventory/lib/customs-form"
import {
  getCustomsDocument,
  getCustomsRevision,
  listCustomsDocuments,
  listCustomsRevisions,
  newCustomsDraft,
  type CustomsDocumentDetail,
  type CustomsDocumentRow,
  type CustomsRevisionEntry,
} from "@/modules/it-inventory/server/queries/customs-documents"
import { requirePermission } from "@/server/auth/session"
import { recordActivity } from "@/server/queries/activity"

import { CustomsDocumentActions } from "./customs-document-actions"
import { CustomsDocumentForm } from "./customs-document-form"
import { CustomsDocumentView } from "./customs-document-view"

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

const COLUMNS: DataTableColumn<CustomsDocumentRow>[] = [
  {
    header: "Nomor aju",
    cell: (row) => <span className="font-mono text-foreground">{row.ajuNumber}</span>,
  },
  { header: "Tanggal aju", cell: (row) => wibDate(row.ajuDate) },
  {
    header: "Pemasok/penerima",
    className: "w-full",
    cell: (row) => row.counterparty ?? "—",
  },
  {
    header: "Nomor daftar",
    cell: (row) =>
      row.registrationNumber ? (
        <span className="font-mono">
          {row.registrationNumber}
          {row.registrationDate && ` · ${wibDate(row.registrationDate)}`}
        </span>
      ) : (
        "—"
      ),
  },
  { header: "Barang", align: "right", cell: (row) => formatNumber(row.lineCount) },
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
    <>
      <PageHeader title={spec.title} description={spec.description} />
      <Suspense fallback={<DataTableSkeleton />}>
        <CustomsTable spec={spec} searchParams={searchParams} />
      </Suspense>
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
  const { rows, total } = await listCustomsDocuments({ ...params, docCode: spec.code, status })
  const createLabel = `Buat ${spec.title}`

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canWrite && (
            <Link href={`${spec.path}/baru`} className={buttonVariants()}>
              <Plus />
              {createLabel}
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
          placeholder="Cari nomor aju, nomor daftar, atau partner"
          filters={[
            {
              name: "status",
              label: "Status",
              options: CUSTOMS_DOCUMENT_STATUSES.map((value) => ({
                value,
                label: CUSTOMS_DOCUMENT_STATUS_LABELS[value],
              })),
            },
          ]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${spec.path}/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({
          searchParams: raw,
          basePath: spec.path,
          noun: `dokumen ${spec.title}`,
          create: canWrite ? { href: `${spec.path}/baru`, label: createLabel } : undefined,
        })}
      />
    </div>
  )
}

export function NewCustomsDocumentPage({ spec }: { spec: CustomsFormSpec }) {
  return (
    <>
      <PageHeader
        title={`Buat ${spec.title}`}
        description="Disimpan sebagai Draft dengan nomor aju baru. Isian boleh dilengkapi bertahap."
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" />}>
        <NewCustomsForm spec={spec} />
      </Suspense>
    </>
  )
}

async function NewCustomsForm({ spec }: { spec: CustomsFormSpec }) {
  const user = await requirePermission("bc:write")
  const { draft, refLabels, companyReady } = await newCustomsDraft(spec, user.name)
  return (
    <div className="space-y-4">
      {!companyReady && (
        <p role="alert" className="max-w-4xl rounded-lg bg-warning-soft p-3 text-control">
          Profil perusahaan belum diisi, jadi entitas perusahaan dan nomor aju belum bisa dibuat.{" "}
          <Link href="/master/perusahaan" className="font-medium underline underline-offset-4">
            Isi profil perusahaan
          </Link>
        </p>
      )}
      <CustomsDocumentForm spec={spec} initial={draft} initialLabels={refLabels} />
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
    <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" />}>
      <CustomsDetail spec={spec} params={params} />
    </Suspense>
  )
}

const STEPS = [
  { code: "draft", label: "Draft" },
  { code: "ready", label: "Siap ajukan" },
  { code: "submitted", label: "Diajukan" },
  { code: "registered", label: "Terdaftar" },
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
  const activity = await recordActivity("customs_documents", doc.id, CUSTOMS_ACTIVITY_LABELS)
  const revisions = await listCustomsRevisions(spec, doc.id, doc.draft)
  const canWrite = hasPermission(user.roles, "bc:write")
  const editable = canWrite && (doc.status === "draft" || doc.status === "ready")

  return (
    <DocumentLayout
      title={`${spec.title} ${doc.ajuNumber}`}
      actions={
        <CustomsDocumentActions
          id={doc.id}
          ajuNumber={doc.ajuNumber}
          status={doc.status}
          canWrite={canWrite}
          canCancel={hasPermission(user.roles, "bc:cancel")}
        />
      }
      crumbs={[{ label: doc.ajuNumber }]}
      meta={
        <span>
          Tanggal aju {wibDate(doc.ajuDate)}
          {doc.registrationNumber &&
            ` · Nomor daftar ${doc.registrationNumber}${
              doc.registrationDate ? ` (${wibDate(doc.registrationDate)})` : ""
            }`}
          {doc.version > 1 && ` · Versi ${doc.version}`}
        </span>
      }
      status={
        <StatusSteps
          steps={STEPS}
          current={doc.status}
          outside={
            doc.status === "rejected"
              ? { label: "Ditolak", tone: "danger" }
              : doc.status === "cancelled"
                ? { label: "Batal", tone: "neutral" }
                : undefined
          }
        />
      }
      activity={<ActivityLog entries={activity} noun="dokumen" />}
    >
      <div className="space-y-4">
        <StatusNotice doc={doc} />
        {editable ? (
          <CustomsDocumentForm
            spec={spec}
            documentId={doc.id}
            initial={doc.draft}
            initialLabels={doc.refLabels}
          />
        ) : (
          <CustomsDocumentView spec={spec} draft={doc.draft} refLabels={doc.refLabels} />
        )}
        {revisions.length > 0 && (
          <RevisionHistory path={`${spec.path}/${doc.id}`} revisions={revisions} />
        )}
      </div>
    </DocumentLayout>
  )
}

// Keterangan status di atas isi dokumen: kekurangan Draft, siap diajukan, alasan penolakan,
// dan data pendaftaran.
function StatusNotice({ doc }: { doc: CustomsDocumentDetail }) {
  if (doc.status === "draft" && doc.missing.length) {
    return (
      <details className="max-w-4xl rounded-lg bg-warning-soft p-3 text-control">
        <summary className="cursor-pointer font-medium">
          Belum bisa diajukan: {doc.missing.length} isian belum lengkap
        </summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {doc.missing.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </details>
    )
  }
  if (doc.status === "ready") {
    return (
      <p className="max-w-4xl rounded-lg bg-success-soft p-3 text-control">
        Isian lengkap. Input dokumen di portal CEISA, lalu tekan Ajukan.
      </p>
    )
  }
  if (doc.status === "rejected" && doc.rejectionReason) {
    return (
      <p role="alert" className="max-w-4xl rounded-lg bg-destructive/10 p-3 text-control">
        <span className="font-medium">Ditolak Bea Cukai:</span> {doc.rejectionReason}
      </p>
    )
  }
  return null
}

// Riwayat revisi (M3-12): siapa, kapan, alasan, dan apa yang berubah di versi berikutnya.
function RevisionHistory({ path, revisions }: { path: string; revisions: CustomsRevisionEntry[] }) {
  return (
    <Section title="Riwayat revisi">
      <ol className="max-w-4xl divide-y rounded-lg border">
        {[...revisions].reverse().map((revision) => (
          <li key={revision.version} className="space-y-1 p-3 text-control">
            <p>
              <Link
                href={`${path}/versi/${revision.version}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Versi {revision.version}
              </Link>{" "}
              <span className="text-muted-foreground">
                direvisi {revision.userName ?? "sistem"} · {formatDateTime(revision.createdAt)}
              </span>
            </p>
            <p>Alasan: {revision.reason}</p>
            <p className="text-caption text-muted-foreground">
              {revision.changes.length
                ? `Berubah di versi ${revision.version + 1}: ${revision.changes.join(", ")}`
                : `Belum ada perubahan di versi ${revision.version + 1}.`}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// Versi lama dokumen (snapshot revisi), hanya baca.
export function CustomsRevisionPage({
  spec,
  params,
}: {
  spec: CustomsFormSpec
  params: Promise<{ id: string; version: string }>
}) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" />}>
      <RevisionDetail spec={spec} params={params} />
    </Suspense>
  )
}

async function RevisionDetail({
  spec,
  params,
}: {
  spec: CustomsFormSpec
  params: Promise<{ id: string; version: string }>
}) {
  await requirePermission("bc:read")
  const { id, version } = await params
  const number = Number(version)
  if (!z.uuid().safeParse(id).success || !Number.isInteger(number) || number < 1) notFound()
  const revision = await getCustomsRevision(spec, id, number)
  if (!revision) notFound()
  return (
    <DocumentLayout
      title={`${spec.title} ${revision.ajuNumber} versi ${revision.version}`}
      crumbs={[
        { label: revision.ajuNumber, href: `${spec.path}/${id}` },
        { label: `Versi ${revision.version}` },
      ]}
      meta={
        <span>
          Versi lama, hanya baca
          {revision.registrationNumber && ` · Nomor daftar ${revision.registrationNumber}`} ·
          Direvisi {formatDateTime(revision.createdAt)}: {revision.reason}
        </span>
      }
    >
      <CustomsDocumentView spec={spec} draft={revision.draft} refLabels={revision.refLabels} />
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const CUSTOMS_ACTIVITY_LABELS = {
  fields: {
    status: "Status",
    customs_office_code: "Kantor pabean",
    registration_number: "Nomor daftar",
    registration_date: "Tanggal daftar",
    response_code: "Respon",
    response_number: "Nomor respon",
    response_date: "Tanggal respon",
    rejection_reason: "Alasan penolakan",
    currency_code: "Valuta",
    ndpbm: "NDPBM",
    cif_value: "Nilai CIF",
    fob_value: "Nilai FOB",
    delivery_price: "Harga penyerahan",
    gross_weight: "Berat kotor",
    net_weight: "Berat bersih",
    signer_name: "Penandatangan",
    notes: "Catatan",
    version: "Versi",
    submitted_at: "Tanggal diajukan",
  },
  values: { status: CUSTOMS_DOCUMENT_STATUS_LABELS as Record<string, string> },
}
