import Link from "next/link"
import type { ReactNode } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"
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
  const wide = new Set(["Catatan", "Alasan"])
  return (
    <div className="space-y-8">
      <InfoGrid items={rows.map(([label, value]) => ({ label, value, wide: wide.has(label) }))} />
      <Section title="Barang">
        <DataTable
          columns={lineColumns(transfer)}
          rows={transfer.lines}
          rowKey={(line) => line.id}
        />
      </Section>
    </div>
  )
}
