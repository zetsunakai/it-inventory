import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { formatDecimal } from "@/lib/decimal"
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
  type CustomsQtyRow,
} from "@/modules/it-inventory/server/queries/customs-transfers"
import { requireUser } from "@/server/auth/session"

import { TransferCustomsActions } from "./transfer-customs-actions"

const wibDate = (value: string) => formatDate(new Date(`${value}T00:00:00+07:00`))

const QTY_COLUMNS: DataTableColumn<CustomsQtyRow>[] = [
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
  {
    header: "Qty dokumen",
    align: "right",
    cell: (row) => `${formatDecimal(row.documentQty)} ${row.uomCode}`,
  },
  {
    header: "Sudah Selesai",
    align: "right",
    cell: (row) => `${formatDecimal(row.doneQty)} ${row.uomCode}`,
  },
  {
    header: "Transfer ini",
    align: "right",
    cell: (row) => `${formatDecimal(row.transferQty)} ${row.uomCode}`,
  },
  {
    header: "Sisa setelah ini",
    align: "right",
    cell: (row) => {
      const rest = Number(row.documentQty) - Number(row.doneQty) - Number(row.transferQty)
      return (
        <span className={rest < 0 ? "font-medium text-destructive" : undefined}>
          {formatDecimal(rest.toFixed(4))} {row.uomCode}
        </span>
      )
    },
  },
]

// Panel dokumen BC di detail penerimaan/pengiriman (backlog M4-04, M4-05): dokumen tertaut, qty per
// produk dokumen vs transfer, dan alasan gerbang yang masih menahan validasi. Disisipkan halaman
// src/app ke TransferDetailPage, jadi modul inventory tidak bergantung pada modul IT Inventory.
export async function TransferCustomsPanel({ transferId }: { transferId: string }) {
  const [user, customs] = await Promise.all([requireUser(), getTransferCustoms(transferId)])
  if (!customs) return null
  const canRead = hasPermission(user.roles, "bc:read")
  const canWrite = hasPermission(user.roles, "bc:write") && customs.open
  const doc = customs.document

  return (
    <Section title="Dokumen BC">
      <div className="space-y-4">
        {doc ? (
          <InfoGrid
            items={[
              {
                label: "Dokumen",
                value: canRead ? (
                  <Link
                    href={`${CUSTOMS_SPECS[doc.docCode].path}/${doc.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {CUSTOMS_DOC_CODE_LABELS[doc.docCode]} {doc.ajuNumber}
                  </Link>
                ) : (
                  `${CUSTOMS_DOC_CODE_LABELS[doc.docCode]} ${doc.ajuNumber}`
                ),
              },
              {
                label: "Nomor daftar",
                value: doc.registrationNumber
                  ? `${doc.registrationNumber}${doc.registrationDate ? ` · ${wibDate(doc.registrationDate)}` : ""}`
                  : "—",
              },
              {
                label: "Status",
                value: (
                  <StatusBadge tone={CUSTOMS_DOCUMENT_STATUS_TONES[doc.status]}>
                    {CUSTOMS_DOCUMENT_STATUS_LABELS[doc.status]}
                  </StatusBadge>
                ),
              },
            ]}
          />
        ) : (
          <p className="text-control text-muted-foreground">
            Belum ditautkan. Transfer ini wajib{" "}
            {customs.allowed.map((code) => CUSTOMS_DOC_CODE_LABELS[code]).join(" atau ")} yang
            Terdaftar sebelum bisa divalidasi.
          </p>
        )}

        {customs.gate.length > 0 && (
          <div role="status" className="rounded-lg bg-warning-soft p-3 text-control">
            <p className="font-medium">Belum bisa divalidasi:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {customs.gate.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}

        {customs.quantities.length > 0 && (
          <DataTable columns={QTY_COLUMNS} rows={customs.quantities} rowKey={(row) => row.sku} />
        )}

        {canWrite && (
          <TransferCustomsActions
            transferId={customs.transferId}
            allowed={customs.allowed}
            linked={Boolean(doc)}
          />
        )}
      </div>
    </Section>
  )
}
