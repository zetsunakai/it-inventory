import Link from "next/link"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { StaticField, ViewSection } from "@/components/form-field"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { transferHref } from "@/modules/inventory/lib/transfer"
import type { TransferType } from "@/modules/inventory/lib/inventory"
import {
  OWNER_CODE,
  customsFieldValue,
  formatCustomsValue,
  isFieldGroup,
  isListBlock,
  sideBySide,
  type CustomsAttachmentDraft,
  type CustomsBlock,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFormSpec,
  type CustomsListBlock,
} from "@/modules/it-inventory/lib/customs-form"

import type { RefLabels } from "./customs-field"

type Row = Record<string, unknown> & { seq: number }

// Tampilan baca dokumen BC (mode baca RecordModes, dokumen bukan Draft, atau user tanpa izin
// ubah): tab, kartu, dan span field sama dengan form hmx jenisnya, tanpa kontrol yang di-disable.
export function CustomsDocumentView({
  spec,
  number,
  companyName,
  draft,
  refLabels,
}: {
  spec: CustomsFormSpec
  number: string
  companyName: string
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
          const product = (row as { product?: { id: string; sku: string; name: string } | null })
            .product
          return product ? (
            <Link href={`/master/produk/${product.id}`} className="text-primary hover:underline">
              [{product.sku}] {product.name}
            </Link>
          ) : (
            "—"
          )
        }
        return show(column, row[column.key] as string | undefined)
      },
    })),
  ]

  const blockContent = (block: CustomsBlock, key: string) => {
    if (isListBlock(block)) {
      return (
        <ViewSection key={key} title={block.title}>
          <div className="min-w-0">
            <DataTable
              columns={listColumns(block)}
              rows={listRows(block)}
              rowKey={(row) => String(row.seq)}
              empty={{ title: "Belum ada." }}
            />
          </div>
        </ViewSection>
      )
    }
    return (
      <ViewSection key={key} title={block.title ?? undefined}>
        {block.fields.map((item, index) =>
          isFieldGroup(item) ? (
            <StaticField
              key={index}
              label={item.group}
              value={item.fields
                .map((field) => show(field, customsFieldValue(draft, field)))
                .join(" ")}
            />
          ) : (
            <StaticField
              key={index}
              label={item.label}
              value={show(item, customsFieldValue(draft, item))}
              span={item.span}
            />
          ),
        )}
      </ViewSection>
    )
  }

  // Header di atas tab seperti form hmx (H-03).
  const topValue = (field: CustomsField) => {
    switch (field.key) {
      case "number":
        return number
      case "company":
        return companyName || "—"
      case "transfers":
        return draft.transfers.length ? (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {draft.transfers.map((transfer) => (
              <Link
                key={transfer.id}
                href={transferHref(transfer.type as TransferType, transfer.id)}
                className="font-mono text-primary underline-offset-4 hover:underline"
              >
                {transfer.number}
              </Link>
            ))}
          </span>
        ) : (
          "—"
        )
      default:
        return show(field, customsFieldValue(draft, field))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ViewSection>
        {spec.top.map((field) => (
          <StaticField
            key={field.key}
            label={field.label}
            value={topValue(field)}
            // Tanda kosong "—" tidak memakai font kode.
            mono={
              field.kind === "text" &&
              field.mono &&
              (field.key === "number" || customsFieldValue(draft, field) !== "")
            }
          />
        ))}
      </ViewSection>
      <Tabs defaultValue={spec.tabs[0]?.key}>
        <TabsList>
          {spec.tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {spec.tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            <div className="flex flex-col gap-10">
              {sideBySide(tab.blocks).map((group, index) =>
                group.length > 1 ? (
                  <div key={index} className="grid items-start gap-10 lg:grid-cols-2">
                    {group.map((block) =>
                      blockContent(block, `${tab.key}-${tab.blocks.indexOf(block)}`),
                    )}
                  </div>
                ) : (
                  blockContent(group[0], `${tab.key}-${tab.blocks.indexOf(group[0])}`)
                ),
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
