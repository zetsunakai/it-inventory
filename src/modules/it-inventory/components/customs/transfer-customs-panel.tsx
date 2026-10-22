import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/format"
import { hasPermission } from "@/lib/permissions"
import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  CUSTOMS_DOCUMENT_STATUS_TONES,
} from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import {
  getTransferCustoms,
  type LinkedCustomsDocument,
} from "@/modules/it-inventory/server/queries/customs-transfers"
import { requireUser } from "@/server/auth/session"

const wibDate = (value: string) => formatDate(new Date(`${value}T00:00:00+07:00`))

function columns(canRead: boolean): DataTableColumn<LinkedCustomsDocument>[] {
  return [
    {
      header: "Dokumen",
      cell: (row) =>
        canRead ? (
          <Link
            href={`${CUSTOMS_SPECS[row.docCode].path}/${row.id}`}
            className="font-mono text-primary underline-offset-4 hover:underline"
          >
            {row.number}
          </Link>
        ) : (
          <span className="font-mono">{row.number}</span>
        ),
    },
    { header: "Jenis", cell: (row) => CUSTOMS_DOC_CODE_LABELS[row.docCode] },
    {
      header: "No. Aju",
      className: "w-full",
      cell: (row) => <span className="font-mono">{row.ajuNumber ?? "—"}</span>,
    },
    {
      header: "No. Daftar",
      cell: (row) =>
        row.registrationNumber
          ? `${row.registrationNumber}${row.registrationDate ? ` · ${wibDate(row.registrationDate)}` : ""}`
          : "—",
    },
    {
      header: "Status",
      cell: (row) => (
        <StatusBadge tone={CUSTOMS_DOCUMENT_STATUS_TONES[row.status]}>
          {CUSTOMS_DOCUMENT_STATUS_LABELS[row.status]}
        </StatusBadge>
      ),
    },
  ]
}

// Panel dokumen BC di detail penerimaan/pengiriman dan kaki antar gudang (backlog H-01, H-02):
// hanya baca, mengikuti hmx.
// Transfer dipilih dari sisi dokumen; validasi transfer tidak menunggu dokumen BC. Disisipkan
// halaman src/app ke TransferDetailPage, jadi modul inventory tidak bergantung pada modul IT
// Inventory.
export async function TransferCustomsPanel({ transferId }: { transferId: string }) {
  const [user, customs] = await Promise.all([requireUser(), getTransferCustoms(transferId)])
  if (!customs) return null
  return (
    <Section title="Dokumen BC">
      <DataTable
        columns={columns(hasPermission(user.roles, "bc:read"))}
        rows={customs.documents}
        rowKey={(row) => row.id}
        empty={{
          title: "Belum dipilih dokumen BC.",
          description: `Transfer ini bisa dipilih di ${customs.allowed
            .map((code) => CUSTOMS_DOC_CODE_LABELS[code])
            .join(", ")}.`,
        }}
      />
    </Section>
  )
}
