import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { Section } from "@/components/layout/section"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import type { TransferStatus } from "@/modules/inventory/lib/inventory"
import {
  getDocumentTransfers,
  type DocumentQtyRow,
  type DocumentTransferRow,
} from "@/modules/it-inventory/server/queries/customs-transfers"

const TRANSFER_PATHS = { receipt: "/inventory/penerimaan", delivery: "/inventory/pengiriman" }

const TRANSFER_COLUMNS: DataTableColumn<DocumentTransferRow>[] = [
  {
    header: "Transfer",
    cell: (row) => (
      <Link
        href={`${TRANSFER_PATHS[row.type]}/${row.id}`}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  {
    header: "Jenis",
    className: "w-full",
    cell: (row) => (row.type === "receipt" ? "Penerimaan" : "Pengiriman"),
  },
  { header: "Selesai", cell: (row) => (row.doneAt ? formatDate(row.doneAt) : "—") },
  {
    header: "Status",
    cell: (row) => <TransferStatusBadge status={row.status as TransferStatus} />,
  },
]

const qty = (value: string, uom: string) => `${formatDecimal(value)} ${uom}`

const QTY_COLUMNS: DataTableColumn<DocumentQtyRow>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (row) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{row.sku}</span>
        <span className="text-muted-foreground">{row.productName}</span>
      </span>
    ),
  },
  { header: "Qty dokumen", align: "right", cell: (row) => qty(row.documentQty, row.uomCode) },
  { header: "Sudah Selesai", align: "right", cell: (row) => qty(row.doneQty, row.uomCode) },
  { header: "Sedang berjalan", align: "right", cell: (row) => qty(row.openQty, row.uomCode) },
  {
    header: "Sisa",
    align: "right",
    cell: (row) => {
      const rest = Number(row.documentQty) - Number(row.doneQty)
      return (
        <span className={rest < 0 ? "font-medium text-destructive" : undefined}>
          {qty(rest.toFixed(4), row.uomCode)}
        </span>
      )
    },
  },
]

// Transfer yang memakai dokumen ini dan sisa qty per produk (backlog M4-05, PRD 8.2).
export async function DocumentTransfersSection({ documentId }: { documentId: string }) {
  const { transfers, quantities } = await getDocumentTransfers(documentId)
  return (
    <Section
      title="Transfer"
      description="Satu dokumen boleh dipakai beberapa transfer, selama total yang Selesai per produk tidak melebihi qty dokumen."
    >
      <div className="space-y-4">
        <DataTable
          columns={TRANSFER_COLUMNS}
          rows={transfers}
          rowKey={(row) => row.id}
          empty={{ title: "Belum ada transfer yang memakai dokumen ini." }}
        />
        {quantities.length > 0 && (
          <DataTable columns={QTY_COLUMNS} rows={quantities} rowKey={(row) => row.sku} />
        )}
      </div>
    </Section>
  )
}
