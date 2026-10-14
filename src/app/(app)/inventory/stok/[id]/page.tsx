import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableDate } from "@/components/data-table/data-table-date"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDateTime } from "@/lib/format"
import { MOVEMENT_CODE_LABELS } from "@/lib/inventory"
import { pickFilter, type RawSearchParams } from "@/lib/list-params"
import { TRANSFER_KINDS } from "@/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import {
  getStockProduct,
  listAccessibleWarehouses,
  stockCard,
  type StockCardLine,
} from "@/server/queries/stock"

export const metadata: Metadata = { title: "Kartu stok · IT Inventory" }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())

function pickDate(raw: RawSearchParams, name: string, fallback: string) {
  const value = raw[name]
  return typeof value === "string" && ISO_DATE.test(value) ? value : fallback
}

const KIND_PATHS: Record<string, string> = Object.fromEntries(
  Object.values(TRANSFER_KINDS).map((kind) => [kind.type, kind.path]),
)

export default function StockCardPage({ params, searchParams }: PageProps<"/inventory/stok/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
      <StockCard params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function StockCard({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<RawSearchParams>
}) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const product = await getStockProduct(id)
  if (!product) notFound()
  const raw = await searchParams
  const warehouses = await listAccessibleWarehouses(user.id)
  const warehouseId =
    pickFilter(
      raw,
      "gudang",
      warehouses.map((warehouse) => warehouse.id),
    ) ?? warehouses[0]?.id
  const to = pickDate(raw, "sampai", today())
  const from = pickDate(raw, "dari", `${to.slice(0, 7)}-01`)
  const card = warehouseId
    ? await stockCard({ productId: product.id, warehouseId, from, to })
    : null

  const unit = product.uomCode
  const columns: DataTableColumn<StockCardLine>[] = [
    { header: "Tanggal", cell: (line) => formatDateTime(line.doneAt) },
    {
      header: "Transaksi",
      cell: (line) => (
        <span className="flex flex-col">
          <Link
            href={`${KIND_PATHS[line.transferType]}/${line.transferId}`}
            className="font-mono text-primary underline-offset-4 hover:underline"
          >
            {line.transferNumber}
          </Link>
          <span className="text-xs text-muted-foreground">
            {MOVEMENT_CODE_LABELS[line.movementCode]}
          </span>
        </span>
      ),
    },
    {
      header: "Dari → ke",
      className: "w-full whitespace-normal",
      cell: (line) => (
        <span className="font-mono text-xs">
          {line.sourcePath} → {line.destinationPath}
          {line.lotName && <span className="block">lot {line.lotName}</span>}
        </span>
      ),
    },
    {
      header: "Masuk",
      align: "right",
      cell: (line) => (Number(line.inQty) ? formatDecimal(line.inQty) : "—"),
    },
    {
      header: "Keluar",
      align: "right",
      cell: (line) => (Number(line.outQty) ? formatDecimal(line.outQty) : "—"),
    },
    {
      header: "Saldo",
      align: "right",
      cell: (line) => <span className="font-medium">{formatDecimal(line.balance)}</span>,
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Kartu stok ${product.sku}`}
        description={`${product.name}. Qty dalam ${unit}; pindah lokasi di dalam gudang yang sama tampil masuk dan keluar sekaligus.`}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableFilter
          name="gudang"
          label="Gudang"
          options={warehouses.map((warehouse) => ({
            value: warehouse.id,
            label: `${warehouse.code} · ${warehouse.name}`,
          }))}
        />
        <DataTableDate name="dari" label="Dari" max={to} fallback={from} />
        <DataTableDate name="sampai" label="Sampai" max={today()} fallback={to} />
      </div>
      {card ? (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Saldo awal", card.opening],
              ["Masuk", card.inQty.toFixed(4)],
              ["Keluar", card.outQty.toFixed(4)],
              ["Saldo akhir", card.closing],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatDecimal(value)} <span className="text-sm font-normal">{unit}</span>
                </dd>
              </div>
            ))}
          </dl>
          <DataTable
            columns={columns}
            rows={card.lines}
            rowKey={(line) => line.moveId}
            empty={{ title: "Tidak ada pergerakan di rentang tanggal ini." }}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Anda belum diberi akses ke gudang mana pun.</p>
      )}
    </div>
  )
}
