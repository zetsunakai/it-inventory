import { Plus } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatNumber } from "@/lib/format"
import {
  MOVEMENT_CODE_LABELS,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUSES,
  USAGE_TYPE_LABELS,
  USAGE_TYPES,
} from "@/lib/inventory"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import type { TransferKind } from "@/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import {
  getTransfer,
  listInternalLocations,
  listTransfers,
  listUomChoices,
  type TransferRow,
} from "@/server/queries/transfers"

import { CreateReturnButton } from "./create-return-button"
import { TransferActions } from "./transfer-actions"
import { TransferForm } from "./transfer-form"
import { TransferStatusBadge } from "./transfer-status"
import { TransferView } from "./transfer-view"

// Halaman daftar, buat, dan detail yang sama untuk semua jenis transfer (penerimaan, pengiriman,
// dst.). Halaman di app/(app)/inventory/<jenis>/ hanya meneruskan TRANSFER_KINDS miliknya.

const USAGE_FILTER = "jenis"
const USAGE_OPTIONS = USAGE_TYPES.map((value) => ({ value, label: USAGE_TYPE_LABELS[value] }))
const STATUS_FILTER = "status"
const STATUS_OPTIONS = TRANSFER_STATUSES.map((value) => ({
  value,
  label: TRANSFER_STATUS_LABELS[value],
}))

export function TransferListPage({
  kind,
  title,
  description,
  searchParams,
}: {
  kind: TransferKind
  title: string
  description: string
  searchParams: Promise<RawSearchParams>
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Suspense fallback={<DataTableSkeleton />}>
        <TransferTable kind={kind} searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function TransferTable({
  kind,
  searchParams,
}: {
  kind: TransferKind
  searchParams: Promise<RawSearchParams>
}) {
  const user = await requirePermission("inventory:read")
  const canWrite = hasPermission(user.roles, "inventory:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const status = pickFilter(raw, STATUS_FILTER, TRANSFER_STATUSES)
  const usageType = kind.usageTypes ? pickFilter(raw, USAGE_FILTER, USAGE_TYPES) : undefined
  const { rows, total } = await listTransfers({
    ...params,
    userId: user.id,
    type: kind.type,
    movementCodes: kind.movementCodes,
    status,
    usageType,
  })
  const createHref = `${kind.path}/baru`
  const createLabel = `Buat ${kind.noun}`

  const columns: DataTableColumn<TransferRow>[] = [
    {
      header: "Nomor",
      cell: (row) => <span className="font-mono text-foreground">{row.number}</span>,
    },
    ...(kind.usageTypes
      ? [
          {
            header: "Jenis",
            cell: (row: TransferRow) => (row.usageType ? USAGE_TYPE_LABELS[row.usageType] : "—"),
          },
        ]
      : []),
    ...(kind.partnerLabel
      ? [
          {
            header: kind.partnerLabel,
            cell: (row: TransferRow) => (
              <span className="font-medium text-foreground">{row.partnerName ?? "—"}</span>
            ),
            className: "w-full whitespace-normal",
          },
        ]
      : []),
    {
      header:
        kind.secondLocationLabel || kind.directional
          ? "Dari → ke"
          : kind.locationSide === "destination"
            ? "Ke"
            : "Dari",
      className: kind.partnerLabel ? undefined : "w-full",
      cell: (row) => (
        <span className="font-mono text-xs">
          {kind.secondLocationLabel || kind.directional
            ? `${row.sourcePath} → ${row.destinationPath}`
            : kind.locationSide === "destination"
              ? row.destinationPath
              : row.sourcePath}
        </span>
      ),
    },
    { header: "Referensi", cell: (row) => row.reference ?? "—" },
    {
      header: "Tanggal",
      cell: (row) =>
        row.doneAt
          ? formatDate(row.doneAt)
          : row.scheduledDate
            ? formatDate(new Date(`${row.scheduledDate}T00:00:00+07:00`))
            : "—",
    },
    { header: "Baris", align: "right", cell: (row) => formatNumber(row.lineCount) },
    { header: "Status", cell: (row) => <TransferStatusBadge status={row.status} /> },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch
          placeholder={
            kind.partnerLabel
              ? `Cari nomor, referensi, atau ${kind.partnerLabel.toLowerCase()}`
              : "Cari nomor atau referensi"
          }
        />
        {kind.usageTypes && (
          <DataTableFilter name={USAGE_FILTER} label="Jenis" options={USAGE_OPTIONS} />
        )}
        <DataTableFilter name={STATUS_FILTER} label="Status" options={STATUS_OPTIONS} />
        {canWrite && kind.creatable !== false && (
          <Link href={createHref} className={buttonVariants({ className: "sm:ml-auto" })}>
            <Plus />
            {createLabel}
          </Link>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${kind.path}/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({
          searchParams: raw,
          basePath: kind.path,
          noun: kind.noun,
          create:
            canWrite && kind.creatable !== false
              ? { href: createHref, label: createLabel }
              : undefined,
        })}
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

export function NewTransferPage({
  kind,
  description,
}: {
  kind: TransferKind
  description: string
}) {
  return (
    <>
      <PageHeader title={`Buat ${kind.noun}`} description={description} />
      <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-5xl" />}>
        <NewTransferForm kind={kind} />
      </Suspense>
    </>
  )
}

async function NewTransferForm({ kind }: { kind: TransferKind }) {
  const user = await requirePermission("inventory:write")
  const [locations, uoms] = await Promise.all([listInternalLocations(user.id), listUomChoices()])
  return <TransferForm kind={kind} locations={locations} uoms={uoms} />
}

export function TransferDetailPage({
  kind,
  effect,
  params,
}: {
  kind: TransferKind
  // Akibat validasi untuk konfirmasi, mis. "Stok di lokasi tujuan bertambah".
  effect: string
  params: Promise<{ id: string }>
}) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-5xl" />}>
      <TransferDetail kind={kind} effect={effect} params={params} />
    </Suspense>
  )
}

async function TransferDetail({
  kind,
  effect,
  params,
}: {
  kind: TransferKind
  effect: string
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const transfer = await getTransfer(user.id, id)
  if (!transfer || transfer.type !== kind.type) notFound()
  const canWrite = hasPermission(user.roles, "inventory:write")
  // Transfer antar gudang dan transfer retur dibuat dan diatur permintaannya (R-10, R-11), bukan
  // lewat form. Transfer pengganti retur (penerimaan/pengiriman) tetap bisa diubah, mis. mengisi lot.
  const fromRequest = Boolean(transfer.interwarehouseId) || transfer.type === "return"
  const editable = canWrite && transfer.status === "draft" && !fromRequest
  const [locations, uoms] = editable
    ? await Promise.all([listInternalLocations(user.id), listUomChoices()])
    : [[], []]
  const canReturn =
    canWrite &&
    transfer.status === "done" &&
    (transfer.type === "receipt" || transfer.type === "delivery")

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${
          fromRequest
            ? MOVEMENT_CODE_LABELS[transfer.movementCode]
            : transfer.usageType
              ? USAGE_TYPE_LABELS[transfer.usageType]
              : `${kind.noun.charAt(0).toUpperCase()}${kind.noun.slice(1)}`
        } ${transfer.number}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <TransferStatusBadge status={transfer.status} />
            {transfer.partner && <span>{transfer.partner.name}</span>}
            {transfer.returnOfNumber && <span>Retur dari {transfer.returnOfNumber}</span>}
          </span>
        }
      />
      {canWrite && (
        <TransferActions
          id={transfer.id}
          number={transfer.number}
          status={transfer.status}
          noun={kind.noun}
          effect={effect}
          canBackdate={user.roles.includes("manajer")}
          path={kind.path}
          needsApproval={Boolean(kind.needsApproval)}
          canApprove={hasPermission(user.roles, "inventory:approve")}
          reservable={Boolean(transfer.sourceWarehouseId)}
          instant={Boolean(kind.sameWarehouse) && transfer.movementCode === "ilt"}
          lines={(kind.needsApproval ? [] : transfer.lines).map((line) => ({
            id: line.id,
            sku: line.sku,
            inputQty: line.inputQty,
            uomCode: line.inputUomCode,
          }))}
        />
      )}
      {canReturn && <CreateReturnButton originId={transfer.id} />}
      {editable ? (
        <TransferForm
          kind={kind}
          locations={locations}
          uoms={uoms}
          transfer={{
            id: transfer.id,
            partner: transfer.partner,
            // Penyesuaian: lokasi gudang adalah sisi yang punya gudang; arahnya dari sisi itu.
            locationId: kind.directional
              ? transfer.sourceWarehouseId
                ? transfer.sourceLocationId
                : transfer.destinationLocationId
              : kind.locationSide === "destination"
                ? transfer.destinationLocationId
                : transfer.sourceLocationId,
            direction: kind.directional
              ? transfer.sourceWarehouseId
                ? "decrease"
                : "increase"
              : undefined,
            reason: transfer.reason,
            usageType: transfer.usageType,
            otherLocationId: kind.secondLocationLabel ? transfer.destinationLocationId : undefined,
            scheduledDate: transfer.scheduledDate,
            reference: transfer.reference,
            notes: transfer.notes,
            lines: transfer.lines.map((line) => ({
              product: {
                id: line.productId,
                sku: line.sku,
                name: line.productName,
                uomId: line.stockUomId,
                uomCode: line.stockUomCode,
                uomCategoryId: line.uomCategoryId,
                tracking: line.tracking,
                lotAuto: line.lotAuto,
              },
              inputQty: line.inputQty,
              uomId: line.inputUomId,
              lotName: line.lotName,
            })),
          }}
        />
      ) : (
        <TransferView kind={kind} transfer={transfer} />
      )}
    </div>
  )
}
