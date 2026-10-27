import Link from "next/link"
import { formatDecimal } from "@/lib/decimal"

import { RelationalView } from "@/components/relational/relational-view"
import type { RelationColumn } from "@/components/relational/relational-table"
import { CustomsLinesTable } from "./customs-lines-table"
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
  type CustomsLineDraft,
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

  const listRows = (block: CustomsListBlock, line?: CustomsLineDraft): Row[] => {
    const rows: Record<string, unknown>[] =
      block.list === "owners"
        ? draft.parties
            .filter((party) => party.entityTypeCode === OWNER_CODE)
            .map((party) => ({ ...party, ...party.details }))
        : block.list === "lines"
          ? draft.lines
          : block.list === "vdEntries"
            ? (line?.vdEntries ?? [])
            : draft[block.list]
    return rows.map((row, index) => ({ ...row, seq: index + 1 }))
  }

  const listColumns = (block: CustomsListBlock): RelationColumn<Row>[] => [
    ...block.columns.map((column): RelationColumn<Row> => ({
      id: column.key,
      label: column.label,
      required: column.required,
      optional: !column.required,
      numeric: column.kind === "qty" || column.kind === "money",
      value: (row) => {
        if (column.kind === "file")
          return (row as unknown as CustomsAttachmentDraft).file?.fileName ?? ""
        if (column.kind === "product") {
          const product = row.product as CustomsLineDraft["product"]
          return product ? `[${product.sku}] ${product.name}` : ""
        }
        if (column.kind === "qty" || column.kind === "money") return String(row[column.key] ?? "")
        return show(column, row[column.key] as string | undefined)
      },
      render: (row) => {
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
        const value = show(column, row[column.key] as string | undefined)
        return column.key === "address" ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          value
        )
      },
    })),
  ]

  const blockContent = (block: CustomsBlock, key: string, line?: CustomsLineDraft) => {
    if (isListBlock(block) && block.list === "lines") {
      return (
        <ViewSection key={key} title={block.title}>
          <CustomsLinesTable
            id={`bc-${spec.code}-barang`}
            title={block.title}
            rows={draft.lines.map((row, index) => ({
              key: String(index),
              product: row.product ? `[${row.product.sku}] ${row.product.name}` : "—",
              hsCode: row.hsCode,
              description: row.description,
              stockQty: row.stockQty,
              details: (
                <>
                  {spec.line.blocks.map((item, index) =>
                    blockContent(item, `${key}-detail-${index}`, row),
                  )}
                  <StaticField
                    label="Jumlah dalam Satuan Stok"
                    value={row.stockQty ? formatDecimal(row.stockQty) : "—"}
                  />
                  {(["25", "27", "41"] as const).includes(spec.code as "25" | "27" | "41") && (
                    <ViewSection title="Bahan baku impor/lokal">
                      <RelationalView
                        id={`bc-${spec.code}-raw-materials-${index}`}
                        label="Bahan baku impor/lokal"
                        rows={row.rawMaterials.map((child, childIndex) => ({
                          ...child,
                          seq: childIndex + 1,
                        }))}
                        rowKey={(_, childIndex: number) => String(childIndex)}
                        columns={[
                          ...(
                            [
                              "originCode",
                              "productSerial",
                              "productCode",
                              "hsCode",
                              "description",
                              "quantity",
                              "unitCode",
                            ] as const
                          ).map((key) => ({
                            id: key,
                            label: key,
                            value: (child: Row) => String(child[key] ?? ""),
                          })),
                          {
                            id: "attachments",
                            label: "Dokumen",
                            value: (child: Row) =>
                              ((child.attachments as CustomsAttachmentDraft[] | undefined) ?? [])
                                .map((attachment) => attachment.file?.fileName ?? attachment.number)
                                .filter(Boolean)
                                .join(", "),
                            render: (child: Row) => (
                              <div className="flex flex-col gap-1">
                                {(
                                  (child.attachments as CustomsAttachmentDraft[] | undefined) ?? []
                                ).map((attachment, attachmentIndex) =>
                                  attachment.file ? (
                                    <a
                                      key={attachment.file.fileKey}
                                      href={`/api/customs-files?key=${encodeURIComponent(attachment.file.fileKey)}`}
                                      className="text-primary hover:underline"
                                    >
                                      {attachment.file.fileName}
                                    </a>
                                  ) : (
                                    <span key={attachmentIndex}>{attachment.number || "—"}</span>
                                  ),
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </ViewSection>
                  )}
                  {(["33", "331"] as const).includes(spec.code as "33" | "331") && (
                    <ViewSection title="Entitas barang">
                      <RelationalView
                        id={`bc-${spec.code}-line-entities-${index}`}
                        label="Entitas barang"
                        rows={row.entities.map((child, childIndex) => ({
                          ...child,
                          seq: childIndex + 1,
                        }))}
                        rowKey={(_, childIndex: number) => String(childIndex)}
                        columns={(
                          ["entityTypeCode", "name", "address", "identityNumber"] as const
                        ).map((key) => ({
                          id: key,
                          label: key,
                          value: (child: Row) => String(child[key] ?? ""),
                        }))}
                      />
                    </ViewSection>
                  )}
                  {(["16", "28"] as const).includes(spec.code as "16" | "28") && (
                    <ViewSection title="Pungutan barang">
                      <RelationalView
                        id={`bc-${spec.code}-line-duties-${index}`}
                        label="Pungutan barang"
                        rows={row.duties.map((child, childIndex) => ({
                          ...child,
                          seq: childIndex + 1,
                        }))}
                        rowKey={(_, childIndex: number) => String(childIndex)}
                        columns={(
                          [
                            "levyCode",
                            "taxTypeCode",
                            "rateTypeCode",
                            "rate",
                            "exemptAmount",
                            "facilityCode",
                            "paidAmount",
                            "bmt",
                            "excise",
                          ] as const
                        ).map((key) => ({
                          id: key,
                          label: key,
                          value: (child: Row) => String(child[key] ?? ""),
                        }))}
                      />
                    </ViewSection>
                  )}
                  {spec.line.lartas && (
                    <ViewSection title={spec.line.lartas.title}>
                      <RelationalView
                        id={`bc-${spec.line.lartas.title}`}
                        label={spec.line.lartas.title}
                        rows={row.attachments.map((entry, index) => ({ ...entry, seq: index + 1 }))}
                        rowKey={(_, index: number) => String(index)}
                        columns={listColumns({ ...spec.line.lartas, list: "attachments" })}
                      />
                    </ViewSection>
                  )}
                </>
              ),
            }))}
          />
        </ViewSection>
      )
    }
    if (isListBlock(block)) {
      return (
        <ViewSection key={key} title={block.title}>
          <div className="min-w-0">
            <RelationalView
              id={`bc-${block.title}`}
              label={block.title}
              columns={listColumns(block)}
              rows={listRows(block, line)}
              rowKey={(row) => String(row.seq)}
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
                .map((field) => show(field, customsFieldValue(draft, field, line)))
                .join(" ")}
            />
          ) : (
            <StaticField
              key={index}
              label={item.label}
              multiline={item.kind === "text" && (item.long || item.key === "address")}
              value={
                item.kind === "product"
                  ? line?.product
                    ? `[${line.product.sku}] ${line.product.name}`
                    : "—"
                  : show(item, customsFieldValue(draft, item, line))
              }
              span={item.kind === "product" ? 12 : item.key === "address" ? 6 : item.span}
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
