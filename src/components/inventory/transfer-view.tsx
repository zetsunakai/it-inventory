import Link from "next/link"
import type { ReactNode } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InfoGrid } from "@/components/layout/info-grid"
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  MOVEMENT_CODE_LABELS,
  TRANSACTION_CLASSIFICATION_LABELS,
  USAGE_TYPE_LABELS,
} from "@/lib/inventory"
import type { TransferKind } from "@/lib/transfer"
import type { TransferDetail, TransferLine } from "@/server/queries/transfers"

// Baris permintaan (R-05): qty diminta, qty selesai (setelah validasi), dan lot/nomor seri
// pergerakannya. Nomor seri bisa banyak per baris, jadi ditampilkan satu per baris.
const BASE_COLUMNS: DataTableColumn<TransferLine>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (line) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{line.sku}</span>
        <span className="text-muted-foreground">{line.productName}</span>
      </span>
    ),
  },
  {
    header: "Lot/seri",
    cell: (line) => {
      const names = line.moves.flatMap((move) => (move.lotName ? [move.lotName] : []))
      return names.length ? (
        <span className="flex flex-col font-mono">
          {names.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </span>
      ) : (
        "—"
      )
    },
  },
  {
    header: "Qty diminta",
    align: "right",
    cell: (line) => `${formatDecimal(line.inputQty)} ${line.inputUomCode}`,
  },
]

// Qty dipesan hanya berarti untuk transfer yang sudah dikonfirmasi dan belum Selesai; qty selesai
// hanya ada setelah Selesai. Kolom yang tidak berlaku tidak ditampilkan (tabel tetap muat di HP).
const RESERVED_COLUMN: DataTableColumn<TransferLine> = {
  header: "Qty dipesan",
  align: "right",
  cell: (line) => {
    const reserved = line.moves.reduce((sum, move) => sum + Number(move.reservedQty), 0)
    return reserved ? `${formatDecimal(String(reserved))} ${line.stockUomCode}` : "—"
  },
}

const DONE_COLUMN: DataTableColumn<TransferLine> = {
  header: "Qty selesai",
  align: "right",
  cell: (line) =>
    line.doneQty === null ? "—" : `${formatDecimal(line.doneQty)} ${line.stockUomCode}`,
}

function lineColumns({ status, sourceWarehouseId }: TransferDetail) {
  if (status === "done") return [...BASE_COLUMNS, DONE_COLUMN]
  const confirmed = status === "waiting" || status === "partially_available" || status === "ready"
  // Hanya transfer yang mengambil stok gudang yang memesan stok (R-07).
  if (confirmed && sourceWarehouseId) return [...BASE_COLUMNS, RESERVED_COLUMN]
  return BASE_COLUMNS
}

// Tampilan baca transfer (Siap, Selesai, Batal, atau peran tanpa izin ubah).
export function TransferView({ kind, transfer }: { kind: TransferKind; transfer: TransferDetail }) {
  const rows: [string, ReactNode][] = [
    ...(kind.partnerLabel
      ? [
          [
            kind.partnerLabel,
            transfer.partner ? `[${transfer.partner.code}] ${transfer.partner.name}` : "—",
          ] as [string, ReactNode],
        ]
      : []),
    ["Jenis pergerakan", MOVEMENT_CODE_LABELS[transfer.movementCode]],
    ["Dari", transfer.sourcePath],
    ["Ke", transfer.destinationPath],
    [
      "Tanggal rencana",
      transfer.scheduledDate
        ? formatDate(new Date(`${transfer.scheduledDate}T00:00:00+07:00`))
        : "—",
    ],
    ["Tanggal efektif", transfer.doneAt ? formatDate(transfer.doneAt) : "—"],
    ...(transfer.classification
      ? [
          ["Klasifikasi", TRANSACTION_CLASSIFICATION_LABELS[transfer.classification]] as [
            string,
            ReactNode,
          ],
        ]
      : []),
    [kind.partnerRole ? "Referensi PO/SO" : "Referensi", transfer.reference ?? "—"],
    ...(transfer.interwarehouseId
      ? [
          [
            "Permintaan",
            <Link
              key="interwarehouse"
              href={`/inventory/antar-gudang/${transfer.interwarehouseId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {transfer.interwarehouseNumber}
            </Link>,
          ] as [string, ReactNode],
        ]
      : []),
    ...(transfer.returnRequestId
      ? [
          [
            "Permintaan retur",
            <Link
              key="return-request"
              href={`/inventory/retur/${transfer.returnRequestId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {transfer.returnRequestNumber}
            </Link>,
          ] as [string, ReactNode],
        ]
      : []),
    ...(transfer.backorderOfNumber
      ? [["Lanjutan dari", transfer.backorderOfNumber] as [string, ReactNode]]
      : []),
    ...(transfer.returnOfNumber
      ? [["Retur dari", transfer.returnOfNumber] as [string, ReactNode]]
      : []),
    ...(transfer.returns.length
      ? [
          [
            "Retur",
            <span key="returns" className="flex flex-wrap gap-x-3">
              {transfer.returns.map((item) => (
                <Link
                  key={item.id}
                  href={`/inventory/retur/${item.id}`}
                  className="font-mono text-primary underline-offset-4 hover:underline"
                >
                  {item.number}
                </Link>
              ))}
            </span>,
          ] as [string, ReactNode],
        ]
      : []),
    ["Catatan", transfer.notes ?? "—"],
    ...(transfer.usageType
      ? [["Jenis pemakaian", USAGE_TYPE_LABELS[transfer.usageType]] as [string, ReactNode]]
      : []),
    ...(kind.needsApproval
      ? [
          ["Alasan", transfer.reason ?? "—"] as [string, ReactNode],
          [
            "Disetujui",
            transfer.approvedAt
              ? `${formatDate(transfer.approvedAt)} oleh ${transfer.approvedByName ?? "—"}`
              : "Belum",
          ] as [string, ReactNode],
        ]
      : []),
  ]
  // Catatan dan alasan pindah ke tab Catatan (notebook hmx, RU-23).
  const notes = new Set(["Catatan", "Alasan"])
  const moves = transfer.lines.flatMap((line) =>
    line.moves.map((move) => ({
      ...move,
      sku: line.sku,
      productName: line.productName,
      unit: line.stockUomCode,
    })),
  )
  return (
    <div className="space-y-6">
      <InfoGrid
        items={rows
          .filter(([label]) => !notes.has(label))
          .map(([label, value]) => ({ label, value }))}
      />
      <Tabs defaultValue="barang">
        <TabsList>
          <TabsTrigger value="barang">
            Barang <TabCount>{transfer.lines.length}</TabCount>
          </TabsTrigger>
          <TabsTrigger value="pergerakan">
            Detail pergerakan <TabCount>{moves.length}</TabCount>
          </TabsTrigger>
          <TabsTrigger value="catatan">Catatan</TabsTrigger>
        </TabsList>
        <TabsContent value="barang">
          <DataTable
            columns={lineColumns(transfer)}
            rows={transfer.lines}
            rowKey={(line) => line.id}
          />
        </TabsContent>
        <TabsContent value="pergerakan">
          <DataTable
            columns={MOVE_COLUMNS}
            rows={moves}
            rowKey={(move) => move.id}
            empty={{ title: "Belum ada pergerakan." }}
          />
        </TabsContent>
        <TabsContent value="catatan">
          <InfoGrid
            items={rows
              .filter(([label]) => notes.has(label))
              .map(([label, value]) => ({ label, value, wide: true }))}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

type MoveRow = TransferLine["moves"][number] & { sku: string; productName: string; unit: string }

// Detail pergerakan per lot/nomor seri (R-05): qty dan qty yang dipesan dalam satuan stok.
const MOVE_COLUMNS: DataTableColumn<MoveRow>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (move) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{move.sku}</span>
        <span className="text-muted-foreground">{move.productName}</span>
      </span>
    ),
  },
  {
    header: "Lot/seri",
    cell: (move) => (move.lotName ? <span className="font-mono">{move.lotName}</span> : "—"),
  },
  {
    header: "Qty",
    align: "right",
    cell: (move) => `${formatDecimal(move.qty)} ${move.unit}`,
  },
  {
    header: "Dipesan",
    align: "right",
    cell: (move) =>
      Number(move.reservedQty) ? `${formatDecimal(move.reservedQty)} ${move.unit}` : "—",
  },
]
