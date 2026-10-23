import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableDate } from "@/components/data-table/data-table-date"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DocumentLayout } from "@/components/document/document-layout"
import { StaticField, ViewSection } from "@/components/form-field"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { formatDateTime } from "@/lib/format"
import { movementLabel } from "@/modules/inventory/lib/inventory"
import { pickFilter, type RawSearchParams } from "@/lib/list-params"
import { transferHref } from "@/modules/inventory/lib/transfer"
import { requirePermission } from "@/server/auth/session"
import {
  getStockProduct,
  listAccessibleWarehouses,
  stockCard,
  type StockCardLine,
} from "@/modules/inventory/server/queries/stock"
import { ListToolbar } from "@/components/layout/list-toolbar"

export const metadata: Metadata = { title: "Kartu stok · IT Inventory" }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())

function pickDate(raw: RawSearchParams, name: string, fallback: string) {
  const value = raw[name]
  return typeof value === "string" && ISO_DATE.test(value) ? value : fallback
}

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
            href={transferHref(line.transferType, line.transferId)}
            className="font-mono text-primary underline-offset-4 hover:underline"
          >
            {line.transferNumber}
          </Link>
          <span className="text-caption text-muted-foreground">
            {movementLabel(line.movementCode, line.usageType)}
          </span>
        </span>
      ),
    },
    {
      header: "Dari → ke",
      className: "w-full whitespace-normal",
      cell: (line) => (
        <span className="font-mono text-caption">
          {line.sourcePath} → {line.destinationPath}
          {line.lotId && (
            <Link
              href={`/inventory/lot/${line.lotId}`}
              className="block text-primary underline-offset-4 hover:underline"
            >
              lot {line.lotName}
            </Link>
          )}
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
    <DocumentLayout
      title={`Kartu stok ${product.sku}`}
      crumbs={[{ label: `Kartu stok ${product.sku}` }]}
      meta={`${product.name}. Qty dalam ${unit}; pindah lokasi di dalam gudang yang sama tampil masuk dan keluar sekaligus.`}
    >
      <ListToolbar>
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
      </ListToolbar>
      {card ? (
        <>
          <ViewSection title="Ringkasan saldo">
            {[
              ["Saldo awal", card.opening],
              ["Masuk", card.inQty.toFixed(4)],
              ["Keluar", card.outQty.toFixed(4)],
              ["Saldo akhir", card.closing],
            ].map(([label, value]) => (
              <StaticField
                key={label}
                label={label}
                value={`${formatDecimal(value)} ${unit}`}
                span={3}
              />
            ))}
          </ViewSection>
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
    </DocumentLayout>
  )
}
