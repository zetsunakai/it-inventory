import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { Section } from "@/components/layout/section"
import { PageHeader } from "@/components/page-header"
import { formatDecimal } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import { CUSTOMS_DOC_CODE_LABELS, type CustomsDocCode } from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import {
  customsExceptions,
  IDLE_DOCUMENT_DAYS,
  LOW_ORIGIN_RATIO,
  type IdleDocument,
  type LowOrigin,
  type QtyGap,
  type UndocumentedTransfer,
} from "@/modules/it-inventory/server/queries/customs-exceptions"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Pengecualian dokumen BC · IT Inventory" }

const wibDate = (value: string) => formatDate(new Date(`${value}T00:00:00+07:00`))

function DocumentLink({ id, code, aju }: { id: string; code: CustomsDocCode; aju: string }) {
  return (
    <Link
      href={`${CUSTOMS_SPECS[code].path}/${id}`}
      className="font-mono text-primary underline-offset-4 hover:underline"
    >
      {CUSTOMS_DOC_CODE_LABELS[code]} {aju}
    </Link>
  )
}

const product = (row: { sku: string; productName: string }) => (
  <span className="flex flex-col">
    <span className="font-mono text-foreground">{row.sku}</span>
    <span className="text-muted-foreground">{row.productName}</span>
  </span>
)

const UNDOCUMENTED: DataTableColumn<UndocumentedTransfer>[] = [
  {
    header: "Transfer",
    cell: (row) => (
      <Link
        href={`/inventory/${row.type === "receipt" ? "penerimaan" : "pengiriman"}/${row.id}`}
        className="font-mono text-primary underline-offset-4 hover:underline"
      >
        {row.number}
      </Link>
    ),
  },
  { header: "Jenis", cell: (row) => (row.type === "receipt" ? "Penerimaan" : "Pengiriman") },
  { header: "Partner", className: "w-full", cell: (row) => row.partnerName ?? "—" },
  { header: "Selesai", cell: (row) => formatDate(row.doneAt) },
]

const IDLE: DataTableColumn<IdleDocument>[] = [
  {
    header: "Dokumen",
    className: "w-full",
    cell: (row) => <DocumentLink id={row.id} code={row.docCode} aju={row.ajuNumber} />,
  },
  { header: "Nomor daftar", cell: (row) => row.registrationNumber ?? "—" },
  { header: "Tanggal daftar", cell: (row) => wibDate(row.registrationDate) },
  { header: "Hari", align: "right", cell: (row) => row.days },
]

const GAPS: DataTableColumn<QtyGap>[] = [
  {
    header: "Dokumen",
    cell: (row) => <DocumentLink id={row.documentId} code={row.docCode} aju={row.ajuNumber} />,
  },
  { header: "Produk", className: "w-full whitespace-normal", cell: product },
  {
    header: "Qty dokumen",
    align: "right",
    cell: (row) => `${formatDecimal(row.documentQty)} ${row.uomCode}`,
  },
  {
    header: "Transfer Selesai",
    align: "right",
    cell: (row) => `${formatDecimal(row.doneQty)} ${row.uomCode}`,
  },
  {
    header: "Selisih",
    align: "right",
    cell: (row) =>
      `${formatDecimal((Number(row.documentQty) - Number(row.doneQty)).toFixed(4))} ${row.uomCode}`,
  },
]

const LOW: DataTableColumn<LowOrigin>[] = [
  {
    header: "Dokumen asal",
    cell: (row) => (
      <span className="flex flex-col">
        <DocumentLink id={row.documentId} code={row.docCode} aju={row.ajuNumber} />
        <span className="text-caption text-muted-foreground">Seri {row.seq}</span>
      </span>
    ),
  },
  { header: "Produk", className: "w-full whitespace-normal", cell: product },
  {
    header: "Qty masuk",
    align: "right",
    cell: (row) => `${formatDecimal(row.qtyIn)} ${row.uomCode}`,
  },
  {
    header: "Sisa",
    align: "right",
    cell: (row) => (
      <span className={Number(row.remaining) <= 0 ? "font-medium text-destructive" : undefined}>
        {formatDecimal(row.remaining)} {row.uomCode}
      </span>
    ),
  },
]

// Laporan pengecualian dokumen BC (backlog M4-06, PRD 8.6). Target bagian pertama selalu kosong
// karena gerbang dokumen; isinya hanya transfer lama sebelum gerbang aktif.
export default function CustomsExceptionsPage() {
  return (
    <>
      <PageHeader
        title="Pengecualian dokumen BC"
        description="Hal yang perlu ditelusuri staf exim dan manajer setiap hari."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <Exceptions />
      </Suspense>
    </>
  )
}

async function Exceptions() {
  await requirePermission("bc:read")
  const { undocumented, idle, gaps, low } = await customsExceptions()
  return (
    <div className="space-y-10">
      <div id="tanpa-dokumen">
        <Section
          title={`Penerimaan/pengiriman Selesai tanpa dokumen (${undocumented.length})`}
          description="Target 0. Sejak gerbang dokumen aktif, transfer gudang berikat tidak bisa Selesai tanpa dokumen Terdaftar."
        >
          <DataTable
            columns={UNDOCUMENTED}
            rows={undocumented}
            rowKey={(row) => row.id}
            empty={{ title: "Tidak ada. Semua transfer Selesai punya dokumen BC." }}
          />
        </Section>
      </div>
      <div id="selisih">
        <Section
          title={`Selisih qty dokumen vs transfer (${gaps.length})`}
          description="Dokumen Terdaftar yang sudah dipakai transfer Selesai, tapi qty Selesai per produk belum sama dengan qty dokumen."
        >
          <DataTable
            columns={GAPS}
            rows={gaps}
            rowKey={(row) => `${row.documentId}|${row.sku}`}
            empty={{ title: "Tidak ada selisih." }}
          />
        </Section>
      </div>
      <div id="menganggur">
        <Section
          title={`Dokumen Terdaftar belum dipakai transfer (${idle.length})`}
          description={`Lebih dari ${IDLE_DOCUMENT_DAYS} hari sejak tanggal daftar tanpa transfer Selesai.`}
        >
          <DataTable
            columns={IDLE}
            rows={idle}
            rowKey={(row) => row.id}
            empty={{ title: "Tidak ada." }}
          />
        </Section>
      </div>
      <div id="saldo-asal">
        <Section
          title={`Saldo dokumen asal hampir atau sudah habis (${low.length})`}
          description={`Sisa paling banyak ${LOW_ORIGIN_RATIO * 100}% dari qty masuk.`}
        >
          <DataTable
            columns={LOW}
            rows={low}
            rowKey={(row) => `${row.documentId}|${row.seq}`}
            empty={{ title: "Tidak ada." }}
          />
        </Section>
      </div>
    </div>
  )
}
