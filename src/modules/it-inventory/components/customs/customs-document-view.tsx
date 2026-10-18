import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"
import {
  OWNER_CODE,
  customsFieldValue,
  formatCustomsValue,
  isFieldGroup,
  isListBlock,
  type CustomsAttachmentDraft,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFormSpec,
  type CustomsListBlock,
} from "@/modules/it-inventory/lib/customs-form"

import type { RefLabels } from "./customs-field"

type Row = Record<string, unknown> & { seq: number }

// Tampilan baca dokumen BC (dokumen bukan Draft, atau user tanpa izin ubah): tab dan grup sama
// dengan form hmx jenisnya, tanpa kontrol yang di-disable.
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

  const listRows = (block: CustomsListBlock): Row[] => {
    const rows: Record<string, unknown>[] =
      block.list === "owners"
        ? draft.parties
            .filter((party) => party.entityTypeCode === OWNER_CODE)
            .map((party) => ({ ...party, ...party.details }))
        : block.list === "lines"
          ? draft.lines
          : block.list === "vdEntries"
            ? []
            : draft[block.list]
    return rows.map((row, index) => ({ ...row, seq: index + 1 }))
  }

  const listColumns = (block: CustomsListBlock): DataTableColumn<Row>[] => [
    { header: "Seri", align: "right", cell: (row) => row.seq },
    ...block.columns.map((column): DataTableColumn<Row> => ({
      header: column.label,
      className: "whitespace-normal",
      cell: (row) => {
        if (column.kind === "file") {
          const file = (row as unknown as CustomsAttachmentDraft).file
          return file ? (
            <a
              href={`/api/customs-files?key=${encodeURIComponent(file.fileKey)}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {file.fileName}
            </a>
          ) : (
            "—"
          )
        }
        if (column.kind === "product") {
          const product = (row as { product?: { sku: string; name: string } | null }).product
          return product ? `[${product.sku}] ${product.name}` : "—"
        }
        return show(column, row[column.key] as string | undefined)
      },
    })),
  ]

  return (
    <div className="space-y-8">
      {spec.tabs.map((tab) => (
        <Section key={tab.key} title={tab.label}>
          <div className="space-y-6">
            {tab.blocks.map((block, index) => {
              if (isListBlock(block)) {
                return (
                  <div key={index} className="space-y-2">
                    {block.title !== tab.label && (
                      <h3 className="text-control font-medium">{block.title}</h3>
                    )}
                    <DataTable
                      columns={listColumns(block)}
                      rows={listRows(block)}
                      rowKey={(row) => String(row.seq)}
                      empty={{ title: "Belum ada." }}
                    />
                  </div>
                )
              }
              return (
                <div key={index} className="space-y-2">
                  {block.title && <h3 className="text-control font-medium">{block.title}</h3>}
                  <InfoGrid
                    items={block.fields.map((item) =>
                      isFieldGroup(item)
                        ? {
                            label: item.group,
                            value: item.fields
                              .map((field) => show(field, customsFieldValue(draft, field)))
                              .join(" "),
                          }
                        : { label: item.label, value: show(item, customsFieldValue(draft, item)) },
                    )}
                  />
                </div>
              )
            })}
          </div>
        </Section>
      ))}
    </div>
  )
}
