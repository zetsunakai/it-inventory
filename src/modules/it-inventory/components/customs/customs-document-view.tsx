import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"
import { formatDecimal } from "@/lib/decimal"
import {
  CUSTOMS_STATEMENT_FIELDS,
  formatCustomsValue,
  type CustomsAttachmentDraft,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFormSpec,
  type CustomsLineDraft,
} from "@/modules/it-inventory/lib/customs-form"

import type { RefLabels } from "./customs-field"

// Tampilan baca dokumen BC (dokumen bukan Draft, atau user tanpa izin ubah): isian per bagian
// seperti form, tanpa kontrol yang di-disable.
export function CustomsDocumentView({
  spec,
  draft,
  refLabels,
}: {
  spec: CustomsFormSpec
  draft: CustomsDocumentDraft
  refLabels: RefLabels
}) {
  const show = (field: CustomsField, value: string | undefined) =>
    formatCustomsValue(field, value, refLabels)
  const headerValue = (field: CustomsField) =>
    field.detail ? draft.details[field.key] : (draft.header as Record<string, string>)[field.key]
  const grid = (fields: CustomsField[]) =>
    fields.map((field) => ({ label: field.label, value: show(field, headerValue(field)) }))

  const lineColumns: DataTableColumn<CustomsLineDraft & { seq: number }>[] = [
    { header: "Seri", align: "right", cell: (line) => line.seq },
    {
      header: "Barang",
      className: "w-full whitespace-normal",
      cell: (line) => (
        <span className="flex flex-col">
          <span className="font-mono text-foreground">{line.product?.sku}</span>
          <span className="text-muted-foreground">{line.description || line.product?.name}</span>
        </span>
      ),
    },
    {
      header: "Kode HS",
      cell: (line) => <span className="font-mono">{line.hsCode || "—"}</span>,
    },
    {
      header: "Jumlah",
      align: "right",
      cell: (line) =>
        line.qty ? `${formatDecimal(line.qty.replace(",", "."))} ${line.ceisaUnitCode}` : "—",
    },
  ]

  const attachmentColumns: DataTableColumn<CustomsAttachmentDraft & { seq: number }>[] = [
    {
      header: "Jenis",
      className: "w-full whitespace-normal",
      cell: (row) =>
        show(
          { key: "type", label: "", kind: "ref", refType: "document_type" },
          row.documentTypeCode,
        ),
    },
    { header: "Nomor", cell: (row) => row.number || "—" },
    {
      header: "Tanggal",
      cell: (row) => (row.date ? row.date.split("-").reverse().join("/") : "—"),
    },
    {
      header: "File",
      cell: (row) =>
        row.file ? (
          <a
            href={`/api/customs-files?key=${encodeURIComponent(row.file.fileKey)}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            {row.file.fileName}
          </a>
        ) : (
          "—"
        ),
    },
  ]

  return (
    <div className="space-y-8">
      <Section title="Header">
        <InfoGrid
          items={[
            {
              label: "Kantor pabean",
              value: show(
                { key: "customsOfficeCode", label: "", kind: "ref", refType: "customs_office" },
                draft.header.customsOfficeCode,
              ),
            },
            ...grid(spec.header),
            ...grid(spec.transaction),
          ]}
        />
      </Section>
      <Section title="Entitas">
        <InfoGrid
          items={spec.parties.map((role) => {
            const party = draft.parties.find((entry) => entry.entityTypeCode === role.code)
            return {
              label: role.label,
              value: party
                ? [party.name, party.identityNumber, party.address].filter(Boolean).join("\n")
                : "—",
            }
          })}
        />
      </Section>
      <Section title="Barang">
        <DataTable
          columns={lineColumns}
          rows={draft.lines.map((line, index) => ({ ...line, seq: index + 1 }))}
          rowKey={(line) => String(line.seq)}
        />
      </Section>
      <Section title="Lampiran">
        <DataTable
          columns={attachmentColumns}
          rows={draft.attachments.map((row, index) => ({ ...row, seq: index + 1 }))}
          rowKey={(row) => String(row.seq)}
          empty={{ title: "Belum ada lampiran." }}
        />
      </Section>
      <Section title="Pernyataan">
        <InfoGrid
          items={[
            ...grid(CUSTOMS_STATEMENT_FIELDS),
            { label: "Catatan", value: draft.header.notes || "—", wide: true },
          ]}
        />
      </Section>
    </div>
  )
}
