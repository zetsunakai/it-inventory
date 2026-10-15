import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { ReturnRequestActions } from "@/components/inventory/return-request-actions"
import { ReturnRequestForm } from "@/components/inventory/return-request-form"
import { TransferStatusBadge } from "@/components/inventory/transfer-status"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  MOVEMENT_CODE_LABELS,
  RETURN_LINE_ACTION_LABELS,
  RETURN_REQUEST_STATUS_LABELS,
  RETURN_REQUEST_STATUS_TONES,
  RETURN_REQUEST_TYPE_LABELS,
  type TransferType,
} from "@/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { getReturnRequest, type ReturnRequestDetail } from "@/server/queries/return-requests"
import { listInternalLocations } from "@/server/queries/transfers"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"

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
    cell: (row) => (row.type === "return" ? MOVEMENT_CODE_LABELS[row.movementCode] : "Pengganti"),
  },
  { header: "Tanggal", cell: (row) => (row.doneAt ? formatDate(row.doneAt) : "—") },
  { header: "Status", cell: (row) => <TransferStatusBadge status={row.status} /> },
]

const LINE_COLUMNS: DataTableColumn<RequestLine>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (line) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{line.sku}</span>
        <span className="text-muted-foreground">
          {line.name}
          {line.lot && <span className="font-mono"> · lot {line.lot}</span>}
        </span>
      </span>
    ),
  },
  { header: "Tindakan", cell: (line) => RETURN_LINE_ACTION_LABELS[line.action] },
  {
    header: "Qty diminta",
    align: "right",
    cell: (line) => `${formatDecimal(line.qty)} ${line.uom}`,
  },
  {
    header: "Qty diretur",
    align: "right",
    cell: (line) => `${formatDecimal(line.returned)} ${line.uom}`,
  },
]

export default function ReturnRequestPage({ params }: PageProps<"/inventory/retur/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-4xl" />}>
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
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          canWrite && (
            <ReturnRequestActions
              id={request.id}
              number={request.number}
              status={request.status}
              cancellable={cancellable}
            />
          )
        }
        title={`Retur ${request.number}`}
        crumbs={[{ label: request.number }]}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge tone={RETURN_REQUEST_STATUS_TONES[request.status]}>
              {RETURN_REQUEST_STATUS_LABELS[request.status]}
            </StatusBadge>
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
      />
      {editable ? (
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
      ) : (
        <div className="space-y-8">
          <InfoGrid
            items={rows.map(([label, value]) => ({
              label,
              value,
              wide: label === "Catatan" || label === "Alasan" || label === "Alasan retur",
            }))}
          />
          <Section title="Transfer">
            <DataTable
              columns={TRANSFER_COLUMNS}
              rows={request.transfers}
              rowKey={(row) => row.id}
            />
          </Section>
          <Section title="Barang">
            <DataTable columns={LINE_COLUMNS} rows={request.lines} rowKey={(line) => line.id} />
          </Section>
        </div>
      )}
    </div>
  )
}
