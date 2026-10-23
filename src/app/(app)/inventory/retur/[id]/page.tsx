import type { Metadata } from "next"
import { RecordModes } from "@/components/layout/record-modes"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { z } from "zod"

import { RelationalView } from "@/components/relational/relational-view"
import {
  RETURN_LINE_FIELDS,
  lineTableColumns,
} from "@/modules/inventory/components/line-table-columns"
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { ReturnRequestActions } from "@/modules/inventory/components/return-request-actions"
import { ReturnRequestForm } from "@/modules/inventory/components/return-request-form"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  RETURN_LINE_ACTION_LABELS,
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_TYPE_LABELS,
  type TransferType,
} from "@/modules/inventory/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  getReturnRequest,
  type ReturnRequestDetail,
} from "@/modules/inventory/server/queries/return-requests"
import { listInternalLocations } from "@/modules/inventory/server/queries/transfers"
import { InfoGrid } from "@/components/layout/info-grid"
import { recordActivity, statusDates } from "@/server/queries/activity"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { StatusSteps } from "@/components/document/status-steps"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = { title: "Detail retur · IT Inventory" }

type LinkedTransfer = ReturnRequestDetail["transfers"][number]
type RequestLine = ReturnRequestDetail["lines"][number]

// Halaman detail per jenis transfer milik permintaan retur.
const TRANSFER_PATHS: Partial<Record<TransferType, string>> = {
  return: "/inventory/retur/transfer",
  receipt: "/inventory/penerimaan",
  delivery: "/inventory/pengiriman",
}

const TRANSFER_COLUMNS: DataTableColumn<LinkedTransfer>[] = [
  {
    header: "Transfer",
    cell: (row) => (
      <Link
        href={`${TRANSFER_PATHS[row.type]}/${row.id}`}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  {
    header: "Jenis",
    className: "w-full",
    // Kode hmx (I-02): gi_rtn keluar (ke vendor), gr_rtn masuk (dari customer).
    cell: (row) =>
      row.type === "return"
        ? row.movementCode === "gi_rtn"
          ? "Retur ke vendor"
          : "Retur dari customer"
        : "Pengganti",
  },
  { header: "Tanggal", cell: (row) => (row.doneAt ? formatDate(row.doneAt) : "—") },
  { header: "Status", cell: (row) => <TransferStatusBadge status={row.status} /> },
]

const LINE_COLUMNS = lineTableColumns<RequestLine>(RETURN_LINE_FIELDS, [
  {
    id: "product",
    label: "Produk",
    value: (line) => `[${line.sku}] ${line.name}${line.lot ? ` · lot ${line.lot}` : ""}`,
  },
  {
    id: "qty",
    label: "Qty retur",
    value: (line) => line.qty,
    render: (line) => formatDecimal(line.qty),
  },
  { id: "max", label: "Maksimum", value: (line) => `${formatDecimal(line.max)} ${line.uom}` },
  { id: "action", label: "Tindakan", value: (line) => RETURN_LINE_ACTION_LABELS[line.action] },
])

export default function ReturnRequestPage({ params }: PageProps<"/inventory/retur/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const request = await getReturnRequest(user.id, id)
  if (!request) notFound()
  const [activity, dates] = await Promise.all([
    recordActivity("return_requests", request.id, RETURN_ACTIVITY_LABELS),
    statusDates("return_requests", request.id),
  ])
  const canWrite = hasPermission(user.roles, "inventory:write")
  const editable = canWrite && request.status === "draft"
  const locations = editable
    ? (await listInternalLocations(user.id))
        .filter((location) => location.warehouseId === request.warehouseId)
        .map((location) => ({ value: location.id, label: location.path }))
    : []
  // Batal hanya selama belum ada barang yang diretur.
  const cancellable =
    canWrite &&
    (request.status === "draft" ||
      (request.status === "in_progress" &&
        !request.transfers.some((transfer) => transfer.status === "done")))
  // Tutup tanpa pengganti (I-02): barang sudah diretur, transfer retur tidak ada yang terbuka, dan
  // ada baris dengan pengganti. Aturannya juga di database.
  const closable =
    canWrite &&
    request.status === "in_progress" &&
    request.lines.some((line) => line.action === "replace") &&
    request.transfers.some(
      (transfer) => transfer.type === "return" && transfer.status === "done",
    ) &&
    !request.transfers.some(
      (transfer) =>
        transfer.type === "return" && transfer.status !== "done" && transfer.status !== "cancelled",
    )
  const locationLabel = request.type === "vendor" ? "Lokasi asal" : "Lokasi tujuan"
  const originPath =
    request.originType === "receipt" ? "/inventory/penerimaan" : "/inventory/pengiriman"

  const rows: [string, ReactNode][] = [
    [locationLabel, `${request.locationPath} · ${request.warehouseCode}`],
    [
      "Tanggal rencana",
      request.scheduledDate ? formatDate(new Date(`${request.scheduledDate}T00:00:00+07:00`)) : "—",
    ],
    ["Alasan retur", request.reason ?? "—"],
    ["Catatan", request.notes ?? "—"],
    ...(request.closeReason
      ? [["Ditutup tanpa pengganti", request.closeReason] as [string, ReactNode]]
      : []),
  ]

  return (
    <DocumentLayout
      actions={
        canWrite && (
          <ReturnRequestActions
            id={request.id}
            number={request.number}
            status={request.status}
            cancellable={cancellable}
            closable={closable}
          />
        )
      }
      title={`Retur ${request.number}`}
      crumbs={[{ label: request.number }]}
      meta={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{RETURN_REQUEST_TYPE_LABELS[request.type]}</span>
          <span>{request.partnerName}</span>
          <span>
            Dari{" "}
            <Link
              href={`${originPath}/${request.originId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {request.originNumber}
            </Link>
          </span>
        </span>
      }

      status={
        <StatusSteps
          steps={[
            { code: "draft", label: "Draft" },
            { code: "in_progress", label: "Diproses" },
            { code: "done", label: "Selesai" },
          ]}
          current={request.status}
          dates={dates}
          outside={
            request.status === "cancelled"
              ? { label: "Batal", tone: "neutral", code: "cancelled" }
              : undefined
          }
        />
      }
      activity={<ActivityLog entries={activity} noun="permintaan retur" />}
    >
      {/* Dibuka dalam mode baca seperti dokumen BC; Edit membuka form (Simpan · Buang). */}
      <RecordModes
        canEdit={editable}
        view={
          <div className="space-y-8">
            <InfoGrid
              items={rows.map(([label, value]) => ({
                label,
                value,
                wide:
                  label === "Catatan" ||
                  label === "Alasan" ||
                  label === "Alasan retur" ||
                  label === "Ditutup tanpa pengganti",
              }))}
            />
            <Tabs defaultValue="transfer">
              <TabsList>
                <TabsTrigger value="transfer">Transfer</TabsTrigger>
                <TabsTrigger value="barang">Barang</TabsTrigger>
              </TabsList>
              <TabsContent value="transfer">
                <DataTable
                  columns={TRANSFER_COLUMNS}
                  rows={request.transfers}
                  rowKey={(row) => row.id}
                />
              </TabsContent>
              <TabsContent value="barang">
                <RelationalView
                  id="return-lines"
                  label="Barang yang diretur"
                  columns={LINE_COLUMNS}
                  rows={request.lines}
                  rowKey={(line) => line.id}
                />
                {request.status !== "draft" && (
                  <DataTable
                    columns={[
                      { header: "Produk", cell: (line: RequestLine) => line.sku },
                      {
                        header: "Qty diretur",
                        align: "right",
                        cell: (line: RequestLine) => `${formatDecimal(line.returned)} ${line.uom}`,
                      },
                    ]}
                    rows={request.lines}
                    rowKey={(line) => line.id}
                  />
                )}
              </TabsContent>
            </Tabs>
          </div>
        }
        form={
          <ReturnRequestForm
            locations={locations}
            locationLabel={locationLabel}
            request={{
              id: request.id,
              locationId: request.locationId,
              scheduledDate: request.scheduledDate,
              reason: request.reason,
              notes: request.notes,
              lines: request.lines,
            }}
          />
        }
      />
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const RETURN_ACTIVITY_LABELS = {
  fields: {
    status: "Status",
    location_id: "Lokasi",
    scheduled_date: "Tanggal rencana",
    reason: "Alasan retur",
    notes: "Catatan",
  },
  values: { status: RETURN_REQUEST_STATUS_LABELS as Record<string, string> },
}
