import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InterwarehouseActions } from "@/modules/inventory/components/interwarehouse-actions"
import { InterwarehouseForm } from "@/modules/inventory/components/interwarehouse-form"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  INTERWAREHOUSE_STATUS_LABELS,
  MOVEMENT_CODE_LABELS,
} from "@/modules/inventory/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  getInterwarehouse,
  type InterwarehouseDetail,
} from "@/modules/inventory/server/queries/interwarehouse"
import { listInternalLocations, listUomChoices } from "@/modules/inventory/server/queries/transfers"
import { InfoGrid } from "@/components/layout/info-grid"
import { recordActivity, statusDates } from "@/server/queries/activity"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { StatusSteps } from "@/components/document/status-steps"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const metadata: Metadata = { title: "Detail transfer antar gudang · IT Inventory" }

type LinkedTransfer = InterwarehouseDetail["transfers"][number]
type TransitRow = InterwarehouseDetail["inTransit"][number]
type ProgressRow = InterwarehouseDetail["progress"][number]

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

// Qty per produk dalam satuan stok (I-05): sisa di perjalanan = dikirim − diterima − kembali −
// susut; belum dikirim = qty di transfer keluar yang masih terbuka.
const qtyCell = (value: string, uom: string) =>
  Number(value) === 0 ? "—" : `${formatDecimal(value)} ${uom}`
const inTransitOf = (row: ProgressRow) =>
  Number(row.sent) - Number(row.received) - Number(row.returned) - Number(row.lost)

const PROGRESS_COLUMNS: DataTableColumn<ProgressRow>[] = [
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
  { header: "Diminta", align: "right", cell: (row) => qtyCell(row.requested, row.uom) },
  { header: "Dikirim", align: "right", cell: (row) => qtyCell(row.sent, row.uom) },
  { header: "Diterima", align: "right", cell: (row) => qtyCell(row.received, row.uom) },
  {
    header: "Kembali / susut",
    align: "right",
    cell: (row) => qtyCell((Number(row.returned) + Number(row.lost)).toFixed(4), row.uom),
  },
  {
    header: "Di perjalanan",
    align: "right",
    cell: (row) => {
      const value = inTransitOf(row)
      return value > 0 ? (
        <span className="font-medium text-warning">{qtyCell(value.toFixed(4), row.uom)}</span>
      ) : (
        "—"
      )
    },
  },
  {
    header: "Belum dikirim",
    align: "right",
    cell: (row) => qtyCell(row.pending, row.uom),
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
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
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
  const [activity, dates] = await Promise.all([
    recordActivity("interwarehouse_transfers", request.id, INTERWAREHOUSE_ACTIVITY_LABELS),
    statusDates("interwarehouse_transfers", request.id),
  ])
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
    <DocumentLayout
      actions={
        canWrite && (
          <InterwarehouseActions
            id={request.id}
            number={request.number}
            status={request.status}
            canSettle={canSettle}
          />
        )
      }
      title={`Transfer antar gudang ${request.number}`}
      crumbs={[{ label: request.number }]}

      status={
        <StatusSteps
          steps={[
            { code: "draft", label: "Draft" },
            { code: "confirmed", label: "Dikonfirmasi" },
            { code: "in_progress", label: "Di perjalanan" },
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
      activity={<ActivityLog entries={activity} noun="permintaan" />}
    >
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
        <div className="space-y-8">
          <InfoGrid
            items={rows.map(([label, value]) => ({
              label,
              value,
              wide: label === "Catatan" || label === "Alasan" || label === "Alasan retur",
            }))}
          />
          <Tabs defaultValue="barang">
            <TabsList>
              <TabsTrigger value="barang">Barang</TabsTrigger>
              {request.inTransit.length > 0 && (
                <TabsTrigger value="masih-di-perjalanan">Masih di perjalanan</TabsTrigger>
              )}
              <TabsTrigger value="transfer">Transfer</TabsTrigger>
            </TabsList>
            {request.inTransit.length > 0 && (
              <TabsContent value="masih-di-perjalanan">
                <DataTable
                  columns={TRANSIT_COLUMNS}
                  rows={request.inTransit}
                  rowKey={(row) => `${row.sku}|${row.lot ?? ""}`}
                />
              </TabsContent>
            )}
            <TabsContent value="transfer">
              <DataTable
                columns={TRANSFER_COLUMNS}
                rows={request.transfers}
                rowKey={(row) => row.id}
              />
            </TabsContent>
            <TabsContent value="barang">
              <DataTable
                columns={PROGRESS_COLUMNS}
                rows={request.progress}
                rowKey={(row) => row.sku}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const INTERWAREHOUSE_ACTIVITY_LABELS = {
  fields: {
    status: "Status",
    source_location_id: "Lokasi asal",
    destination_location_id: "Lokasi tujuan",
    scheduled_date: "Tanggal rencana",
    reference: "Referensi",
    notes: "Catatan",
  },
  values: { status: INTERWAREHOUSE_STATUS_LABELS as Record<string, string> },
}
