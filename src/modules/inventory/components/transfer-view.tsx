import Link from "next/link"
import type { ReactNode } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { RelationalView } from "@/components/relational/relational-view"
import type { RelationColumn } from "@/components/relational/relational-table"
import { TRANSFER_LINE_FIELDS, lineTableColumns } from "./line-table-columns"
import { InfoGrid } from "@/components/layout/info-grid"
import { TabCount, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import {
  MOVEMENT_CODE_LABELS,
  TRANSACTION_CLASSIFICATION_LABELS,
  USAGE_TYPE_LABELS,
} from "@/modules/inventory/lib/inventory"
import type { TransferKind } from "@/modules/inventory/lib/transfer"
import type { TransferDetail, TransferLine } from "@/modules/inventory/server/queries/transfers"

// Baris permintaan (R-05, RU-02): qty diminta, dipesan, selesai, dan lot/nomor seri pergerakannya.
// Satu baris bisa punya beberapa lot/nomor seri: masing-masing satu baris, dengan qty-nya bila
// lebih dari satu.
const BASE_COLUMNS = lineTableColumns<TransferLine>(TRANSFER_LINE_FIELDS, [
  {
    id: "product",
    label: "Produk",
    value: (line) => `[${line.sku}] ${line.productName}`,
    render: (line) => (
      <Link href={`/master/produk/${line.productId}`} className="text-primary hover:underline">
        [{line.sku}] {line.productName}
      </Link>
    ),
  },
  {
    id: "qty",
    label: "Qty",
    value: (line) => line.inputQty,
    render: (line) => formatDecimal(line.inputQty),
  },
  { id: "uom", label: "Satuan", value: (line) => line.inputUomCode },
  {
    id: "lot",
    label: "Nomor lot",
    value: (line) =>
      line.moves
        .map((move) => move.lotName)
        .filter(Boolean)
        .join(", "),
    render: (line) => <LotList line={line} />,
  },
])

function LotList({ line }: { line: TransferLine }) {
  const lots = line.moves.filter((move) => move.lotName)
  return lots.length ? (
    <span className="flex flex-col">
      {lots.map((move) => (
        <span key={move.id} className="whitespace-nowrap">
          <span className="font-mono">{move.lotName}</span>
          {lots.length > 1 && (
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {formatDecimal(move.qty)} {line.stockUomCode}
            </span>
          )}
        </span>
      ))}
    </span>
  ) : (
    "—"
  )
}

// Tombol rincian lot di sel Lot/seri (RU-03, I-01), supaya tidak jadi kolom tambahan yang terdorong
// keluar layar.
function withLotEditor(
  columns: RelationColumn<TransferLine>[],
  lotEditor?: (line: TransferLine) => ReactNode,
) {
  if (!lotEditor) return columns
  return columns.map((column) =>
    column.id === "lot"
      ? {
          ...column,
          render: (line: TransferLine) => (
            <span className="flex flex-col items-start gap-1.5">
              <LotList line={line} />
              {lotEditor(line)}
            </span>
          ),
        }
      : column,
  )
}

// Qty dipesan hanya berarti untuk transfer yang sudah dikonfirmasi dan belum Selesai; qty selesai
// hanya ada setelah Selesai. Kolom yang tidak berlaku tidak ditampilkan (tabel tetap muat di HP).
const RESERVED_COLUMN: DataTableColumn<TransferLine> = {
  header: "Qty dipesan",
  align: "right",
  cell: (line) => {
    const reserved = line.moves.reduce((sum, move) => sum + Number(move.reservedQty), 0)
    // Baris yang stoknya belum terpesan penuh ditandai supaya terlihat sebelum Validasi.
    const short = reserved < Number(line.qty)
    return (
      <span className={short ? "font-medium text-warning" : undefined}>
        {reserved ? `${formatDecimal(String(reserved))} ${line.stockUomCode}` : "—"}
        {short && <span className="block text-caption">belum tersedia penuh</span>}
      </span>
    )
  },
}

const DONE_COLUMN: DataTableColumn<TransferLine> = {
  header: "Qty selesai",
  align: "right",
  cell: (line) =>
    line.doneQty === null ? "—" : `${formatDecimal(line.doneQty)} ${line.stockUomCode}`,
}

function lineColumns(
  { status, sourceWarehouseId }: TransferDetail,
  lotEditor?: (line: TransferLine) => ReactNode,
) {
  if (status === "done") return [...BASE_COLUMNS, operationalColumn(DONE_COLUMN)]
  const base = withLotEditor(BASE_COLUMNS, lotEditor)
  // Transfer yang mengambil stok gudang: stok tersedia per baris sebelum Validasi (I-01), lalu qty
  // yang dipesan setelah dikonfirmasi (R-07).
  if (sourceWarehouseId && status !== "cancelled") {
    const confirmed = status === "waiting" || status === "partially_available" || status === "ready"
    return [
      ...base,
      operationalColumn(AVAILABLE_COLUMN),
      ...(confirmed ? [operationalColumn(RESERVED_COLUMN)] : []),
    ]
  }
  // Penerimaan Siap: rincian lot dan qty diterima per baris (RU-03).
  if (lotEditor) return [...base, operationalColumn(RECEIVED_COLUMN)]
  return BASE_COLUMNS
}

function operationalColumn(column: DataTableColumn<TransferLine>): RelationColumn<TransferLine> {
  return {
    id: column.header,
    label: column.header,
    numeric: column.align === "right",
    render: column.cell,
    value: (line) => {
      if (column === DONE_COLUMN) return line.doneQty ?? ""
      if (column === AVAILABLE_COLUMN) return line.stock?.available ?? ""
      return String(
        line.moves.reduce(
          (sum, move) => sum + Number(column === RESERVED_COLUMN ? move.reservedQty : move.qty),
          0,
        ),
      )
    },
  }
}

// Stok tersedia di lokasi asal dan sub-lokasinya untuk baris ini (I-01). Kurang dari qty diminta
// ditandai; produk berpelacakan yang belum dipesan menampilkan saran lot (masuk paling awal).
const AVAILABLE_COLUMN: DataTableColumn<TransferLine> = {
  header: "Tersedia",
  align: "right",
  cell: (line) => {
    if (!line.stock) return "—"
    const short = Number(line.stock.available) < Number(line.qty)
    const reserved = line.moves.some((move) => Number(move.reservedQty) > 0)
    const suggestion = line.tracking !== "none" && !reserved ? line.stock.lots[0]?.name : undefined
    return (
      <span className={short ? "font-medium text-warning" : undefined}>
        {formatDecimal(line.stock.available)} {line.stockUomCode}
        {short && <span className="block text-caption">kurang dari diminta</span>}
        {suggestion && (
          <span className="block text-caption text-muted-foreground">
            saran lot <span className="font-mono">{suggestion}</span>
          </span>
        )}
      </span>
    )
  },
}

const RECEIVED_COLUMN: DataTableColumn<TransferLine> = {
  header: "Qty diterima",
  align: "right",
  cell: (line) => {
    // Pergerakan bawaan tanpa lot untuk produk berpelacakan = rincian belum diisi.
    const [first] = line.moves
    if (
      line.tracking !== "none" &&
      line.moves.length === 1 &&
      !first.lotName &&
      first.qty === line.qty
    )
      return "—"
    const received = line.moves.reduce((sum, move) => sum + Number(move.qty), 0)
    return (
      <span className={received < Number(line.qty) ? "font-medium text-warning" : undefined}>
        {formatDecimal(received.toFixed(4))} {line.stockUomCode}
      </span>
    )
  },
}

// Tampilan baca transfer (Siap, Selesai, Batal, atau peran tanpa izin ubah).
export function TransferView({
  kind,
  transfer,
  lotEditor,
}: {
  kind: TransferKind
  transfer: TransferDetail
  // Tombol rincian lot per baris (penerimaan Siap, RU-03).
  lotEditor?: (line: TransferLine) => ReactNode
}) {
  const rows: [string, ReactNode][] = [
    ...(kind.partnerLabel
      ? [
          [
            kind.partnerLabel,
            transfer.partner ? (
              <Link
                key="partner"
                href={`/master/partner/${transfer.partner.id}`}
                className="text-primary hover:underline"
              >
                {transfer.partner.name}
              </Link>
            ) : (
              "—"
            ),
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
          // Penolakan terakhir (I-03) tetap tampil setelah dikembalikan ke Draft.
          ...(transfer.rejectedAt
            ? [
                [
                  transfer.status === "rejected" ? "Ditolak" : "Ditolak sebelumnya",
                  <span key="rejected" className="whitespace-pre-line">
                    {formatDate(transfer.rejectedAt)} oleh {transfer.rejectedByName ?? "—"}:{" "}
                    {transfer.rejectionReason}
                  </span>,
                ] as [string, ReactNode],
              ]
            : []),
        ]
      : []),
    ...(transfer.stockCountId && transfer.stockCountNumber
      ? [
          [
            "Sesi opname",
            <Link
              key="count"
              href={`/inventory/opname/${transfer.stockCountId}`}
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {transfer.stockCountNumber}
            </Link>,
          ] as [string, ReactNode],
        ]
      : []),
  ]
  // Catatan dan alasan pindah ke tab Catatan (notebook hmx, RU-23).
  const notes = new Set(["Catatan", "Alasan"])
  const showMovements = transfer.type !== "receipt"
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
          {showMovements && (
            <TabsTrigger value="pergerakan">
              Detail pergerakan <TabCount>{moves.length}</TabCount>
            </TabsTrigger>
          )}
          <TabsTrigger value="catatan">Catatan</TabsTrigger>
        </TabsList>
        <TabsContent value="barang">
          <RelationalView
            id="transfer-lines"
            label="Barang"
            columns={lineColumns(transfer, lotEditor)}
            rows={transfer.lines}
            rowKey={(line) => line.id}
          />
        </TabsContent>
        {showMovements && (
          <TabsContent value="pergerakan">
            <DataTable
              columns={MOVE_COLUMNS}
              rows={moves}
              rowKey={(move) => move.id}
              empty={{ title: "Belum ada pergerakan." }}
            />
          </TabsContent>
        )}
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
