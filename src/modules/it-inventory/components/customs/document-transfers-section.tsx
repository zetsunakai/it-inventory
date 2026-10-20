import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { Section } from "@/components/layout/section"
import { formatDate } from "@/lib/format"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import {
  MOVEMENT_CODE_LABELS,
  type MovementCode,
  type TransferStatus,
} from "@/modules/inventory/lib/inventory"
import { transferHref } from "@/modules/inventory/lib/transfer"
import {
  getDocumentTransfers,
  type DocumentTransferRow,
} from "@/modules/it-inventory/server/queries/customs-transfers"

const TRANSFER_COLUMNS: DataTableColumn<DocumentTransferRow>[] = [
  {
    header: "Transfer",
    cell: (row) => (
      <Link
        href={transferHref(row.type, row.id)}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  {
    header: "Pergerakan",
    className: "w-full",
    cell: (row) => MOVEMENT_CODE_LABELS[row.movementCode as MovementCode] ?? row.movementCode,
  },
  { header: "Selesai", cell: (row) => (row.doneAt ? formatDate(row.doneAt) : "—") },
  {
    header: "Status",
    cell: (row) => <TransferStatusBadge status={row.status as TransferStatus} />,
  },
]

// Transfer yang dipilih dokumen ini (backlog H-01, Inventory Transfer Documents hmx).
export async function DocumentTransfersSection({ documentId }: { documentId: string }) {
  const transfers = await getDocumentTransfers(documentId)
  return (
    <Section title="Transfer">
      <DataTable
        columns={TRANSFER_COLUMNS}
        rows={transfers}
        rowKey={(row) => row.id}
        empty={{ title: "Belum ada transfer yang dipilih." }}
      />
    </Section>
  )
}
