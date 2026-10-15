import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InterwarehouseActions } from "@/components/inventory/interwarehouse-actions"
import { InterwarehouseForm } from "@/components/inventory/interwarehouse-form"
import { TransferStatusBadge } from "@/components/inventory/transfer-status"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  INTERWAREHOUSE_STATUS_LABELS,
  INTERWAREHOUSE_STATUS_TONES,
  MOVEMENT_CODE_LABELS,
} from "@/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { getInterwarehouse, type InterwarehouseDetail } from "@/server/queries/interwarehouse"
import { listInternalLocations, listUomChoices } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Detail transfer antar gudang · IT Inventory" }

type LinkedTransfer = InterwarehouseDetail["transfers"][number]
type TransitRow = InterwarehouseDetail["inTransit"][number]
type RequestLine = InterwarehouseDetail["lines"][number]

const TRANSFER_COLUMNS: DataTableColumn<LinkedTransfer>[] = [
  {
    header: "Transfer",
    cell: (row) => (
      <Link
        href={`${row.type === "scrap" ? "/inventory/scrap" : "/inventory/transfer"}/${row.id}`}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  {
    header: "Jenis",
    className: "w-full",
    cell: (row) => MOVEMENT_CODE_LABELS[row.movementCode],
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
        <span className="font-mono text-foreground">{line.product.sku}</span>
        <span className="text-muted-foreground">{line.product.name}</span>
      </span>
    ),
  },
  {
    header: "Qty diminta",
    align: "right",
    cell: (line) => `${formatDecimal(line.inputQty)} ${line.uomCode}`,
  },
]

const TRANSIT_COLUMNS: DataTableColumn<TransitRow>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{row.sku}</span>
        <span className="text-muted-foreground">{row.name}</span>
      </span>
    ),
  },
  {
    header: "Lot/seri",
    cell: (row) => (row.lot ? <span className="font-mono">{row.lot}</span> : "—"),
  },
  {
    header: "Di perjalanan",
    align: "right",
    cell: (row) => `${formatDecimal(row.qty)} ${row.uom}`,
  },
]

export default function InterwarehouseDetailPage({
  params,
}: PageProps<"/inventory/antar-gudang/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-5xl" />}>
      <Detail params={params} />
    </Suspense>
  )
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const request = await getInterwarehouse(user.id, id)
  if (!request) notFound()
  const canWrite = hasPermission(user.roles, "inventory:write")
  const editable = canWrite && request.status === "draft"
  const [locations, uoms] = editable
    ? await Promise.all([listInternalLocations(user.id), listUomChoices()])
    : [[], []]
  const openTransfers = request.transfers.some(
    (transfer) => transfer.status !== "done" && transfer.status !== "cancelled",
  )
  const canSettle =
    canWrite && request.status === "in_progress" && !openTransfers && request.inTransit.length > 0

  const rows: [string, ReactNode][] = [
    ["Dari", `${request.sourcePath} · ${request.sourceWarehouse}`],
    ["Ke", `${request.destinationPath} · ${request.destinationWarehouse}`],
    [
      "Tanggal rencana",
      request.scheduledDate ? formatDate(new Date(`${request.scheduledDate}T00:00:00+07:00`)) : "—",
    ],
    ["Referensi", request.reference ?? "—"],
    ["Catatan", request.notes ?? "—"],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Transfer antar gudang ${request.number}`}
        crumbs={[{ label: request.number }]}
        description={
          <StatusBadge tone={INTERWAREHOUSE_STATUS_TONES[request.status]}>
            {INTERWAREHOUSE_STATUS_LABELS[request.status]}
          </StatusBadge>
        }
      />
      {canWrite && (
        <InterwarehouseActions
          id={request.id}
          number={request.number}
          status={request.status}
          canSettle={canSettle}
        />
      )}
      {editable ? (
        <InterwarehouseForm
          locations={locations}
          uoms={uoms}
          request={{
            id: request.id,
            sourceLocationId: request.sourceLocationId,
            destinationLocationId: request.destinationLocationId,
            scheduledDate: request.scheduledDate,
            reference: request.reference,
            notes: request.notes,
            lines: request.lines.map((line) => ({
              product: line.product,
              inputQty: line.inputQty,
              uomId: line.uomId,
            })),
          }}
        />
      ) : (
        <div className="max-w-5xl space-y-6">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
          {request.inTransit.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">Masih di perjalanan</h2>
              <DataTable
                columns={TRANSIT_COLUMNS}
                rows={request.inTransit}
                rowKey={(row) => `${row.sku}|${row.lot ?? ""}`}
              />
            </section>
          )}
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Transfer</h2>
            <DataTable
              columns={TRANSFER_COLUMNS}
              rows={request.transfers}
              rowKey={(row) => row.id}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Barang diminta</h2>
            <DataTable columns={LINE_COLUMNS} rows={request.lines} rowKey={(line) => line.id} />
          </section>
        </div>
      )}
    </div>
  )
}
