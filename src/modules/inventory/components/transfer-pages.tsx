import { Plus, ScanLine } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { toDecimalInput } from "@/lib/decimal"
import { formatDate, formatNumber } from "@/lib/format"
import {
  MOVEMENT_CODE_LABELS,
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUSES,
  type TransferStatus,
  USAGE_TYPE_LABELS,
  USAGE_TYPES,
} from "@/modules/inventory/lib/inventory"
import {
  GROUP_PARAM,
  GROUPED_PAGE_SIZE,
  parseListParams,
  pickFilter,
  type RawSearchParams,
} from "@/lib/list-params"
import { hasPermission } from "@/lib/permissions"
import { transferHref, type TransferKind, transferSteps } from "@/modules/inventory/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import {
  getTransfer,
  listInternalLocations,
  listTransfers,
  listUomChoices,
  type TransferDetail,
  type TransferLine,
  type TransferRow,
  transferNeighbors,
} from "@/modules/inventory/server/queries/transfers"
import { recordActivity, statusDates } from "@/server/queries/activity"
import { ActivityLog } from "@/components/document/activity-log"
import { NewRecordLayout } from "@/components/document/new-record-layout"
import { DocumentLayout } from "@/components/document/document-layout"
import { StatusSteps } from "@/components/document/status-steps"

import { CreateReturnButton } from "./create-return-button"
import { LineLotEditor, type LotLine } from "./line-lot-editor"
import { TransferActions } from "./transfer-actions"
import { TransferForm } from "./transfer-form"
import { TransferStatusBadge } from "./transfer-status"
import { TransferView } from "./transfer-view"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { ListPager } from "@/components/data-table/list-pager"

// Halaman daftar, buat, dan detail yang sama untuk semua jenis transfer (penerimaan, pengiriman,
// dst.). Halaman di app/(app)/inventory/<jenis>/ hanya meneruskan TRANSFER_KINDS miliknya.

const USAGE_FILTER = "jenis"
const USAGE_OPTIONS = USAGE_TYPES.map((value) => ({ value, label: USAGE_TYPE_LABELS[value] }))
const STATUS_FILTER = "status"
const GROUPS = ["status"] as const
const GROUPS_WITH_PARTNER = ["status", "partner"] as const
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
  // Dikelompokkan (RU-22): semua baris dimuat sekaligus supaya jumlah per kelompok benar.
  const groupBy = pickFilter(raw, GROUP_PARAM, kind.partnerLabel ? GROUPS_WITH_PARTNER : GROUPS)
  const params = parseListParams(raw, groupBy ? { pageSize: GROUPED_PAGE_SIZE } : undefined)
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
        <span className="font-mono text-caption">
          {kind.secondLocationLabel || kind.directional
            ? `${row.sourcePath} → ${row.destinationPath}`
            : kind.locationSide === "destination"
              ? row.destinationPath
              : row.sourcePath}
        </span>
      ),
    },
    { header: "Referensi", optional: "show", cell: (row) => row.reference ?? "—" },
    {
      header: "Tanggal",
      cell: (row) =>
        row.doneAt
          ? formatDate(row.doneAt)
          : row.scheduledDate
            ? formatDate(new Date(`${row.scheduledDate}T00:00:00+07:00`))
            : "—",
    },
    {
      header: "Baris",
      align: "right",
      optional: "show",
      cell: (row) => formatNumber(row.lineCount),
    },
    { header: "Status", cell: (row) => <TransferStatusBadge status={row.status} /> },
  ]

  return (
    <div className="space-y-4">
      <ListToolbar
        action={
          canWrite &&
          kind.creatable !== false && (
            <Link href={createHref} className={buttonVariants()}>
              <Plus />
              {createLabel}
            </Link>
          )
        }
        pager={
          !groupBy && (
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
          placeholder={
            kind.partnerLabel
              ? `Cari nomor, referensi, atau ${kind.partnerLabel.toLowerCase()}`
              : "Cari nomor atau referensi"
          }
          groupBy={[
            { value: "status", label: "Status" },
            ...(kind.partnerLabel ? [{ value: "partner", label: kind.partnerLabel }] : []),
          ]}
          filters={[
            ...(kind.usageTypes
              ? [{ name: USAGE_FILTER, label: "Jenis", options: USAGE_OPTIONS }]
              : []),
            { name: STATUS_FILTER, label: "Status", options: STATUS_OPTIONS },
          ]}
        />
      </ListToolbar>
      <DataTable
        id={`daftar-${kind.type}`}
        group={
          groupBy === "status"
            ? { key: (row) => row.status, label: (row) => TRANSFER_STATUS_LABELS[row.status] }
            : groupBy === "partner"
              ? {
                  key: (row) => row.partnerName ?? "",
                  label: (row) => row.partnerName ?? `Tanpa ${kind.partnerLabel?.toLowerCase()}`,
                }
              : undefined
        }
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `${kind.path}/${row.id}`}
        rowMuted={(row) => row.status === "cancelled"}
        empty={listEmptyState({
          searchParams: raw,
          noun: kind.noun,
        })}
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
    <NewRecordLayout
      title={`Buat ${kind.noun}`}
      description={description}
      noun={kind.noun}
      status={
        <StatusSteps
          steps={transferSteps({
            reservable: kind.locationSide === "source",
            instant: Boolean(kind.sameWarehouse),
          })}
          current="draft"
        />
      }
    >
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <NewTransferForm kind={kind} />
      </Suspense>
    </NewRecordLayout>
  )
}

async function NewTransferForm({ kind }: { kind: TransferKind }) {
  const user = await requirePermission("inventory:write")
  const [locations, uoms] = await Promise.all([listInternalLocations(user.id), listUomChoices()])
  return <TransferForm kind={kind} locations={locations} uoms={uoms} />
}

// Bagian tambahan dari modul lain di detail transfer, mis. panel dokumen BC (M4-04). Dirakit halaman
// di src/app supaya modul inventory tidak bergantung pada modul IT Inventory.
export type TransferPanel = (transfer: { id: string }) => ReactNode

export function TransferDetailPage({
  kind,
  effect,
  params,
  panel,
}: {
  kind: TransferKind
  // Akibat validasi untuk konfirmasi, mis. "Stok di lokasi tujuan bertambah".
  effect: string
  params: Promise<{ id: string }>
  panel?: TransferPanel
}) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
      <TransferDetail kind={kind} effect={effect} params={params} panel={panel} />
    </Suspense>
  )
}

async function TransferDetail({
  kind,
  effect,
  params,
  panel,
}: {
  kind: TransferKind
  effect: string
  params: Promise<{ id: string }>
  panel?: TransferPanel
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
  const instant = Boolean(kind.sameWarehouse) && transfer.movementCode === "ilt"
  // Penerimaan Siap: barang diterima per lot/nomor seri (RU-03), lewat detail atau layar scan.
  const recording = canRecordLots(transfer, canWrite)
  const [locations, uoms] = editable
    ? await Promise.all([listInternalLocations(user.id), listUomChoices()])
    : [[], []]
  const canReturn =
    canWrite &&
    transfer.status === "done" &&
    (transfer.type === "receipt" || transfer.type === "delivery")
  const [neighbors, activity, dates] = await Promise.all([
    transferNeighbors(user.id, transfer, kind.movementCodes),
    recordActivity("transfers", transfer.id, TRANSFER_ACTIVITY_LABELS),
    statusDates("transfers", transfer.id),
  ])
  const neighborHref = (target?: { id: string; number: string }) =>
    target && { href: transferHref(transfer.type, target.id), label: target.number }

  return (
    <DocumentLayout
      neighbors={{ prev: neighborHref(neighbors.prev), next: neighborHref(neighbors.next) }}
      status={
        <TransferStatusSteps
          status={transfer.status}
          reservable={Boolean(transfer.sourceWarehouseId)}
          instant={instant}
          dates={dates}
        />
      }
      activity={<ActivityLog entries={activity} noun={kind.noun} />}
      title={`${
        transfer.type === "return"
          ? // Kode retur hmx (gi_rtn keluar, gr_rtn masuk) dipakai juga oleh pengganti (I-02).
            transfer.movementCode === "gi_rtn"
            ? "Retur ke vendor"
            : "Retur dari customer"
          : transfer.returnRequestId
            ? transfer.type === "receipt"
              ? "Pengganti dari vendor"
              : "Pengganti ke customer"
            : fromRequest
              ? MOVEMENT_CODE_LABELS[transfer.movementCode]
              : transfer.usageType
                ? USAGE_TYPE_LABELS[transfer.usageType]
                : `${kind.noun.charAt(0).toUpperCase()}${kind.noun.slice(1)}`
      } ${transfer.number}`}
      crumbs={[
        // Transfer milik permintaan antar gudang atau retur: permintaannya jadi tingkat induk.
        ...(transfer.interwarehouseId && transfer.interwarehouseNumber
          ? [
              {
                label: transfer.interwarehouseNumber,
                href: `/inventory/antar-gudang/${transfer.interwarehouseId}`,
              },
            ]
          : []),
        ...(transfer.returnRequestId && transfer.returnRequestNumber
          ? [
              {
                label: transfer.returnRequestNumber,
                href: `/inventory/retur/${transfer.returnRequestId}`,
              },
            ]
          : []),
        { label: transfer.number },
      ]}
      actions={
        canWrite && (
          <>
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
              instant={instant}
              fromRequest={fromRequest}
              lines={(kind.needsApproval ? [] : transfer.lines).map((line) => ({
                id: line.id,
                sku: line.sku,
                productName: line.productName,
                inputQty: line.inputQty,
                uomCode: line.inputUomCode,
                detailed:
                  (transfer.type === "receipt" || transfer.type === "delivery") &&
                  hasLotDetail(line)
                    ? {
                        qty: line.moves.reduce((sum, move) => sum + Number(move.qty), 0).toFixed(4),
                        requested: line.qty,
                        uomCode: line.stockUomCode,
                      }
                    : undefined,
              }))}
            />
            {recording && (
              <Link
                href={`${kind.path}/${transfer.id}/scan`}
                className={buttonVariants({ variant: "outline", className: "pointer-coarse:h-11" })}
              >
                <ScanLine />
                Scan
              </Link>
            )}
            {canReturn && <CreateReturnButton originId={transfer.id} />}
          </>
        )
      }
      meta={
        (transfer.partner || transfer.returnOfNumber) && (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {transfer.partner && <span>{transfer.partner.name}</span>}
            {transfer.returnOfNumber && <span>Retur dari {transfer.returnOfNumber}</span>}
          </span>
        )
      }
    >
      {panel?.({ id: transfer.id })}
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
        <TransferView
          kind={kind}
          transfer={transfer}
          lotEditor={
            recording
              ? (line) => <LineLotEditor transferId={transfer.id} line={lotLine(transfer, line)} />
              : undefined
          }
        />
      )}
    </DocumentLayout>
  )
}

// Label log aktivitas transfer (RU-23).
const TRANSFER_ACTIVITY_LABELS = {
  fields: {
    status: "Status",
    scheduled_date: "Tanggal rencana",
    done_at: "Tanggal efektif",
    reference: "Referensi",
    notes: "Catatan",
    reason: "Alasan",
    usage_type: "Jenis pemakaian",
    partner_id: "Partner",
    source_location_id: "Lokasi asal",
    destination_location_id: "Lokasi tujuan",
    approved_at: "Disetujui",
  },
  values: {
    status: TRANSFER_STATUS_LABELS as Record<string, string>,
    usage_type: USAGE_TYPE_LABELS as Record<string, string>,
  },
}

// Langkah status transfer (RU-23, RU-02): transfer yang mengambil stok gudang melewati Menunggu
// stok; pindah lokasi langsung dari Draft ke Selesai.
function TransferStatusSteps({
  status,
  reservable,
  instant,
  dates,
}: {
  status: TransferStatus
  reservable: boolean
  instant: boolean
  dates: Record<string, Date>
}) {
  const steps = transferSteps({ reservable, instant })
  // Sebagian tersedia tampil di langkah Menunggu stok.
  const stepDates = { ...dates, waiting: dates.waiting ?? dates.partially_available }
  if (status === "cancelled") {
    return (
      <StatusSteps
        steps={steps}
        dates={stepDates}
        outside={{ label: "Batal", tone: "neutral", code: "cancelled" }}
      />
    )
  }
  const current = status === "partially_available" ? "waiting" : status
  return (
    <StatusSteps
      steps={steps}
      dates={stepDates}
      current={steps.some((step) => step.code === current) ? current : "ready"}
      currentLabel={TRANSFER_STATUS_LABELS[status]}
    />
  )
}

// Baris yang pergerakannya bukan lagi satu pergerakan sebesar qty diminta: sudah diberi rincian lot
// (RU-03), jadi qty selesainya jumlah rincian itu.
export function hasLotDetail(line: TransferLine) {
  const [move, ...rest] = line.moves
  return !move || rest.length > 0 || move.inputUomId !== line.inputUomId || move.qty !== line.qty
}

// Rincian awal editor: pergerakan yang sudah ada. Satu pergerakan bawaan tanpa lot untuk produk
// berpelacakan belum berarti apa-apa, jadi editornya mulai kosong.
// Rincian lot/nomor seri bisa diisi user (RU-03, I-01): penerimaan Siap, atau pengiriman yang sudah
// dikonfirmasi dan belum Selesai.
export function canRecordLots(
  transfer: { type: TransferDetail["type"]; status: TransferStatus },
  canWrite: boolean,
) {
  if (!canWrite) return false
  if (transfer.type === "receipt") return transfer.status === "ready"
  if (transfer.type === "delivery") {
    return ["waiting", "partially_available", "ready"].includes(transfer.status)
  }
  return false
}

// Rincian awal editor: pergerakan yang sudah ada. Satu pergerakan bawaan tanpa lot untuk produk
// berpelacakan belum berarti apa-apa, jadi editornya mulai kosong.
export function lotLine(transfer: { type: TransferDetail["type"] }, line: TransferLine): LotLine {
  const blank = !hasLotDetail(line) && !line.moves[0]?.lotName && line.tracking !== "none"
  return {
    id: line.id,
    direction: transfer.type === "delivery" ? "out" : "in",
    sku: line.sku,
    productName: line.productName,
    tracking: line.tracking,
    lotAuto: line.lotAuto,
    requested: line.qty,
    uomCode: line.stockUomCode,
    stock: line.stock ?? undefined,
    rows: blank ? [] : initialLotRows(transfer.type === "delivery", line),
  }
}

// Pengiriman: hanya stok yang sudah dipesan (pergerakan tanpa pesanan belum pasti ada barangnya).
// Produk tanpa pelacakan: satu baris qty saja, walaupun pergerakannya dipecah per lokasi.
function initialLotRows(outbound: boolean, line: TransferLine) {
  const moves = outbound ? line.moves.filter((move) => Number(move.reservedQty) > 0) : line.moves
  const qtyOf = (move: TransferLine["moves"][number]) =>
    outbound ? Number(move.reservedQty) : Number(move.qty)
  if (line.tracking === "none") {
    const total = moves.reduce((sum, move) => sum + qtyOf(move), 0)
    return total > 0 ? [{ lot: "", qty: toDecimalInput(total.toFixed(4)) }] : []
  }
  // Penerimaan: apa adanya, termasuk rincian tanpa lot (nomor otomatis).
  if (!outbound) {
    return moves.map((move) => ({ lot: move.lotName ?? "", qty: toDecimalInput(move.qty) }))
  }
  // Satu lot bisa dipesan dari beberapa rak: digabung jadi satu rincian per lot.
  const byLot = new Map<string, number>()
  for (const move of moves) {
    if (!move.lotName) continue
    byLot.set(move.lotName, (byLot.get(move.lotName) ?? 0) + qtyOf(move))
  }
  return [...byLot].map(([lot, qty]) => ({ lot, qty: toDecimalInput(qty.toFixed(4)) }))
}
