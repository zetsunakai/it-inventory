import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import type { TransferKind } from "@/lib/transfer"
import type { TransferDetail, TransferLine } from "@/server/queries/transfers"

const LINE_COLUMNS: DataTableColumn<TransferLine>[] = [
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
    header: "Lot",
    cell: (line) => (line.lotName ? <span className="font-mono">{line.lotName}</span> : "—"),
  },
  {
    header: "Qty",
    align: "right",
    cell: (line) => `${formatDecimal(line.inputQty)} ${line.inputUomCode}`,
  },
  {
    header: "Qty satuan stok",
    align: "right",
    cell: (line) =>
      line.inputUomCode === line.stockUomCode
        ? "—"
        : `${formatDecimal(line.qty)} ${line.stockUomCode}`,
  },
]

// Tampilan baca transfer (Siap, Selesai, Batal, atau peran tanpa izin ubah).
export function TransferView({ kind, transfer }: { kind: TransferKind; transfer: TransferDetail }) {
  const rows: [string, string][] = [
    ...(kind.partnerLabel
      ? [
          [
            kind.partnerLabel,
            transfer.partner ? `[${transfer.partner.code}] ${transfer.partner.name}` : "—",
          ] as [string, string],
        ]
      : []),
    ["Dari", transfer.sourcePath],
    ["Ke", transfer.destinationPath],
    [
      "Tanggal rencana",
      transfer.scheduledDate
        ? formatDate(new Date(`${transfer.scheduledDate}T00:00:00+07:00`))
        : "—",
    ],
    ["Tanggal efektif", transfer.doneAt ? formatDate(transfer.doneAt) : "—"],
    [kind.partnerRole ? "Referensi PO/SO" : "Referensi", transfer.reference ?? "—"],
    ...(transfer.backorderOfNumber
      ? [["Lanjutan dari", transfer.backorderOfNumber] as [string, string]]
      : []),
    ["Catatan", transfer.notes ?? "—"],
  ]
  return (
    <div className="max-w-5xl space-y-6">
      <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Barang</h2>
        <DataTable columns={LINE_COLUMNS} rows={transfer.lines} rowKey={(line) => line.id} />
      </section>
    </div>
  )
}
