"use client"

import { useRouter } from "next/navigation"
import { memo, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"
import { useSaveFeedback } from "@/components/layout/record-modes"
import { RelationalTable } from "@/components/relational/relational-table"
import {
  identifyRelations,
  newRelation,
  relationKey,
  RELATION_KEY,
  sumDecimals,
} from "@/components/relational/relational-utils"
import { formatDecimal } from "@/lib/decimal"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FormState } from "@/lib/action-result"
import { saveCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import {
  CUSTOMS_ROW_KEYS,
  OWNER_CODE,
  customsFieldValue,
  emptyLine,
  formatCustomsValue,
  emptyParty,
  emptyRow,
  isFieldGroup,
  isListBlock,
  sideBySide,
  setCustomsFieldValue,
  type CustomsBlock,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFieldBlock,
  type CustomsFormSpec,
  type CustomsLineDraft,
  type CustomsListBlock,
  type CustomsPartyDraft,
  type CustomsRowDraft,
} from "@/modules/it-inventory/lib/customs-form"

import { AttachmentsEditor } from "./attachments-editor"
import {
  CustomsControl,
  CustomsFormField,
  CustomsGroupField,
  type FieldChange,
  type RefLabels,
} from "./customs-field"

type ProductChoice = { id: string; sku: string; name: string; hsCode: string; uomCode: string }
type PartnerChoice = { id: string; name: string; identityNumber: string }
type OnLabel = (label?: { key: string; name: string }) => void

// Form dokumen BC: tab, grup, field, dan label sama dengan form hmx jenisnya (spec dari
// customs-layouts.generated.ts). Semua isian disimpan di satu state dan dikirim sebagai JSON;
// Field wajib mengikuti aturan kelengkapan aktif per jenis dokumen.
export function CustomsDocumentForm({
  spec,
  documentId,
  initial,
  initialLabels,
  actions,
}: {
  spec: CustomsFormSpec
  documentId?: string
  initial: CustomsDocumentDraft
  initialLabels: RefLabels
  actions?: ReactNode
}) {
  const router = useRouter()
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    saveCustomsDocument,
    null,
  )
  const [draft, setDraft] = useState(() => identifyRelations(initial))
  const [labels, setLabels] = useState(initialLabels)
  const [activeTab, setActiveTab] = useState(spec.tabs[0]?.key)
  const invalidTarget = useRef<HTMLElement | null>(null)
  // Dokumen tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(documentId ? state : null)

  useEffect(() => {
    if (state?.ok && !documentId) router.push(`${spec.path}/${state.data.id}`)
  }, [state, documentId, router, spec.path])

  const rememberLabel: OnLabel = (label) => {
    if (label) setLabels((current) => ({ ...current, [label.key]: label.name }))
  }
  const fieldChange =
    (field: CustomsField): FieldChange =>
    (value, label) => {
      rememberLabel(label)
      setDraft((current) => identifyRelations(setCustomsFieldValue(current, field, value)))
    }
  const value = (field: CustomsField) => customsFieldValue(draft, field)
  const setRows = (list: RowList, rows: CustomsRowDraft[]) =>
    setDraft((current) => ({ ...current, [list]: rows }))

  const fieldBlock = (block: CustomsFieldBlock, key: string) => {
    const role = block.role ? spec.parties.find((party) => party.code === block.role) : undefined
    return (
      <FormSection key={key} title={block.title ?? undefined}>
        {block.fields.map((item, itemIndex) => {
          if (isFieldGroup(item)) {
            return (
              <CustomsGroupField
                key={itemIndex}
                group={item}
                id={fieldId(`${key}-${item.group}`)}
                value={value}
                onChange={fieldChange}
                refLabels={labels}
              />
            )
          }
          // Nama entitas partner dipilih dari master partner (field nama hmx adalah pilihan).
          if (role?.source === "partner" && item.store === "party" && item.key === "name") {
            return (
              <PartnerField
                key={itemIndex}
                id={fieldId(`${key}-partner`)}
                label={item.label}
                required={item.required}
                party={draft.parties.find((entry) => entry.entityTypeCode === role.code)}
                onChange={(party) =>
                  setDraft((current) => ({
                    ...current,
                    parties: [
                      ...current.parties.filter((entry) => entry.entityTypeCode !== role.code),
                      newRelation(party),
                    ],
                  }))
                }
                roleCode={role.code}
              />
            )
          }
          return (
            <CustomsFormField
              key={itemIndex}
              field={item}
              id={fieldId(`${key}-${item.key}`)}
              value={value(item)}
              onChange={fieldChange(item)}
              refLabels={labels}
            />
          )
        })}
      </FormSection>
    )
  }

  const listBlock = (block: CustomsListBlock, key: string): ReactNode => {
    switch (block.list) {
      case "attachments":
        return (
          <AttachmentsEditor
            key={key}
            title={block.title}
            columns={block.columns}
            documentId={documentId}
            idPrefix={fieldId(key)}
            rows={draft.attachments}
            onChange={(rows) => setDraft((current) => ({ ...current, attachments: rows }))}
            refLabels={labels}
            onLabel={rememberLabel}
          />
        )
      case "lines":
        return (
          <LinesEditor
            key={key}
            spec={spec}
            title={block.title}
            documentId={documentId}
            idPrefix={fieldId(key)}
            lines={draft.lines}
            onChange={(lines) => setDraft((current) => ({ ...current, lines }))}
            refLabels={labels}
            onLabel={rememberLabel}
          />
        )
      case "owners": {
        const owners = draft.parties.filter((party) => party.entityTypeCode === OWNER_CODE)
        return (
          <RowsEditor
            key={key}
            title={block.title}
            idPrefix={fieldId(key)}
            columns={block.columns}
            rows={owners.map(ownerRow)}
            onChange={(rows) =>
              setDraft((current) => ({
                ...current,
                parties: [
                  ...current.parties.filter((party) => party.entityTypeCode !== OWNER_CODE),
                  ...rows.map(ownerParty),
                ],
              }))
            }
            newRow={() => emptyRow(OWNER_KEYS)}
            refLabels={labels}
            onLabel={rememberLabel}
          />
        )
      }
      case "vdEntries":
        return null
      default: {
        const list = block.list
        // Kemasan dan peti kemas: daftar yang diisi langsung per baris, seperti list editable hmx.
        const Editor = list === "packages" || list === "containers" ? RowsTable : RowsEditor
        return (
          <Editor
            key={key}
            title={block.title}
            idPrefix={fieldId(key)}
            columns={block.columns}
            rows={draft[list]}
            onChange={(rows) => setRows(list, rows)}
            newRow={() => emptyRow(CUSTOMS_ROW_KEYS[list])}
            refLabels={labels}
            onLabel={rememberLabel}
          />
        )
      }
    }
  }

  const blockContent = (block: CustomsBlock, key: string) =>
    isListBlock(block) ? listBlock(block, key) : fieldBlock(block, key)

  return (
    <form
      action={formAction}
      className={FORM_CLASS}
      onInvalidCapture={(event) => {
        if (invalidTarget.current === event.target) return
        event.preventDefault()
        if (invalidTarget.current || !(event.target instanceof HTMLElement)) return
        const target = event.target
        invalidTarget.current = target
        const tab = target.closest<HTMLElement>("[data-customs-tab]")?.dataset.customsTab
        if (tab) setActiveTab(tab)
        requestAnimationFrame(() => {
          target.focus()
          if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.reportValidity()
          }
          invalidTarget.current = null
        })
      }}
    >
      <FormActions after={actions}>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      {documentId && <input type="hidden" name="id" value={documentId} />}
      <input type="hidden" name="docCode" value={spec.code} />
      <input type="hidden" name="document" value={JSON.stringify(draft)} />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {spec.tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {spec.tabs.map((tab) => (
          // Isi tab tetap terpasang supaya pilihan yang belum disimpan tidak hilang saat pindah tab.
          <TabsContent key={tab.key} value={tab.key} data-customs-tab={tab.key} keepMounted>
            <TabBody active={tab.key === activeTab}>
              {() => (
                <div className="flex flex-col gap-10">
                  {sideBySide(tab.blocks).map((group, index) =>
                    group.length > 1 ? (
                      // Kemasan dan peti kemas berdampingan (kiri–kanan) di layar lebar.
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
              )}
            </TabBody>
          </TabsContent>
        ))}
      </Tabs>
    </form>
  )
}

// Isi tab hanya dirender ulang saat tabnya aktif: mengetik dan pindah tab tidak merender ulang
// ratusan kontrol di tab lain. DOM tab lain tetap terpasang (keepMounted) dengan nilai terakhirnya;
// isian hanya berubah lewat tab yang aktif, dan JSON yang dikirim selalu dari draft terbaru.
const TabBody = memo(
  function TabBody({ children }: { active: boolean; children: () => ReactNode }) {
    return children()
  },
  (_, next) => !next.active,
)

type RowList = keyof typeof CUSTOMS_ROW_KEYS & keyof CustomsDocumentDraft

// Daftar Pemilik Barang: setiap baris adalah entitas pemilik (kode 7) berseri.
const OWNER_KEYS = ["code", "identityTypeCode", "identityNumber", "nitku", "name", "address"]
const ownerRow = (party: CustomsPartyDraft): CustomsRowDraft => ({
  [RELATION_KEY]: relationKey(party),
  code: party.details.code ?? "",
  identityTypeCode: party.identityTypeCode,
  identityNumber: party.identityNumber,
  nitku: party.details.nitku ?? "",
  name: party.name,
  address: party.address,
})
const ownerParty = (row: CustomsRowDraft): CustomsPartyDraft => {
  const details = Object.fromEntries(
    Object.entries({ code: row.code, nitku: row.nitku }).filter(([, entry]) => entry),
  )
  return {
    ...emptyParty(OWNER_CODE),
    ...{ [RELATION_KEY]: relationKey(row) },
    identityTypeCode: row.identityTypeCode ?? "",
    identityNumber: row.identityNumber ?? "",
    name: row.name ?? "",
    address: row.address ?? "",
    details,
  }
}

// Nama entitas peran partner: dipilih dari master partner lalu datanya disalin (bisa diubah tanpa
// mengubah master).
function PartnerField({
  id,
  label,
  roleCode,
  required,
  party,
  onChange,
}: {
  id: string
  label: string
  roleCode: string
  required?: boolean
  party: CustomsPartyDraft | undefined
  onChange: (party: CustomsPartyDraft) => void
}) {
  const current = party ?? emptyParty(roleCode)
  const [partner, setPartner] = useState<PartnerChoice | null>(
    current.name
      ? { id: current.partnerId ?? current.name, name: current.name, identityNumber: "" }
      : null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  async function pickPartner(choice: PartnerChoice | null) {
    setPartner(choice)
    setLoadError(null)
    if (!choice) {
      onChange({ ...current, partnerId: null, name: "" })
      return
    }
    const response = await fetch(`/api/customs-parties?partner=${choice.id}`)
    if (!response.ok) {
      setLoadError("Data partner gagal dimuat. Coba pilih lagi.")
      return
    }
    const data: Pick<
      CustomsPartyDraft,
      | "partnerId"
      | "name"
      | "address"
      | "countryCode"
      | "identityTypeCode"
      | "identityNumber"
      | "details"
    > = await response.json()
    onChange({ ...current, ...data, details: { ...current.details, ...data.details } })
  }

  return (
    <FormField
      label={label}
      htmlFor={id}
      required={required}
      errors={loadError ? [loadError] : undefined}
    >
      <SearchSelect<PartnerChoice>
        id={id}
        endpoint="/api/partners"
        required={required}
        value={partner}
        onValueChange={pickPartner}
        getKey={(choice) => choice.id}
        getLabel={(choice) => choice.name}
        placeholder="Cari nama atau NPWP partner"
      />
    </FormField>
  )
}

type RowsProps = {
  title: string
  idPrefix: string
  rows: CustomsRowDraft[]
  onChange: (rows: CustomsRowDraft[]) => void
  newRow: () => CustomsRowDraft
  columns: CustomsField[]
  refLabels: RefLabels
  onLabel: OnLabel
}

// Seluruh daftar sederhana memakai editor tabel yang sama; metadata baris tidak masuk JSON.
function RowsTable(props: RowsProps) {
  return <RowsEditor {...props} />
}

function RowsEditor({
  title,
  idPrefix,
  rows,
  onChange,
  newRow,
  columns,
  refLabels,
  onLabel,
}: RowsProps) {
  return (
    <FormSection title={title}>
      <RelationalTable<CustomsRowDraft>
        id={`bc-${title}`}
        label={title}
        rows={rows}
        rowKey={relationKey}
        onReorder={onChange}
        onRemove={(keys) => onChange(rows.filter((row) => !keys.includes(relationKey(row))))}
        addLabel="Tambah"
        onAdd={() => {
          const row = newRelation(newRow())
          onChange([...rows, row])
          return relationKey(row)
        }}
        columns={columns.map((column) => ({
          id: column.key,
          label: column.label,
          required: column.required,
          optional: !column.required,
          width: column.kind === "ref" ? 280 : 200,
          numeric: column.kind === "qty" || column.kind === "money",
          value: (row) =>
            column.kind === "qty" || column.kind === "money"
              ? (row[column.key] ?? "")
              : formatCustomsValue(column, row[column.key], refLabels),
          render: (row) => formatCustomsValue(column, row[column.key], refLabels),
          edit: (row, index) => (
            <CustomsControl
              field={column}
              id={`${idPrefix}-${relationKey(row)}-${column.key}`}
              value={row[column.key] ?? ""}
              ariaLabel={`${column.label} ${title} seri ${index + 1}`}
              refLabels={refLabels}
              onChange={(value, label) => {
                onLabel(label)
                onChange(
                  rows.map((entry) =>
                    relationKey(entry) === relationKey(row)
                      ? { ...entry, [column.key]: value }
                      : entry,
                  ),
                )
              }}
            />
          ),
          footer:
            column.kind === "money"
              ? (items) => formatDecimal(sumDecimals(items.map((row) => row[column.key] ?? "")))
              : undefined,
        }))}
      />
    </FormSection>
  )
}

// Barang ditampilkan ringkas. Detail tiap seri tetap satu form dengan dokumen agar validasi
// required, Dokumen Lartas, dan Voluntary Declaration tetap bekerja saat detail ditutup.
function LinesEditor({
  spec,
  title,
  documentId,
  idPrefix,
  lines,
  onChange,
  refLabels,
  onLabel,
}: {
  spec: CustomsFormSpec
  title: string
  documentId?: string
  idPrefix: string
  lines: CustomsLineDraft[]
  onChange: (lines: CustomsLineDraft[]) => void
  refLabels: RefLabels
  onLabel: OnLabel
}) {
  const update = (index: number, patch: Partial<CustomsLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)))
  const lineValue = (line: CustomsLineDraft) => (field: CustomsField) =>
    field.store === "lineDetails"
      ? (line.details[field.key] ?? "")
      : ((line as unknown as Record<string, string>)[field.key] ?? "")
  const lineChange =
    (index: number, line: CustomsLineDraft) =>
    (field: CustomsField): FieldChange =>
    (value, label) => {
      onLabel(label)
      update(
        index,
        field.store === "lineDetails"
          ? { details: { ...line.details, [field.key]: value } }
          : ({ [field.key]: value } as Partial<CustomsLineDraft>),
      )
    }

  return (
    <FormSection
      title={title}
      description="Hanya produk yang sudah punya kode HS. Jumlah dalam satuan stok dicocokkan dengan transfer."
    >
      <RelationalTable<CustomsLineDraft>
        id={`bc-${spec.code}-barang`}
        label={title}
        rows={lines}
        rowKey={relationKey}
        onReorder={onChange}
        onRemove={(keys) => onChange(lines.filter((line) => !keys.includes(relationKey(line))))}
        addLabel="Tambah Barang"
        onAdd={() => {
          const line = newRelation(emptyLine())
          onChange([...lines, line])
          return relationKey(line)
        }}
        columns={[
          {
            id: "product",
            label: "Produk",
            required: true,
            width: 340,
            value: (line) => (line.product ? `[${line.product.sku}] ${line.product.name}` : ""),
            render: (line) =>
              line.product ? (
                <a
                  href={`/master/produk/${line.product.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  [{line.product.sku}] {line.product.name}
                </a>
              ) : (
                "—"
              ),
          },
          { id: "hsCode", label: "Kode HS", width: 180, value: (line) => line.hsCode },
          {
            id: "description",
            label: "Uraian",
            width: 280,
            optional: true,
            value: (line) => line.description,
          },
          {
            id: "stockQty",
            label: "Jumlah dalam Satuan Stok",
            width: 240,
            numeric: true,
            required: true,
            value: (line) => line.stockQty,
          },
        ]}
        details={(line, index) => {
          const valueOf = lineValue(line)
          const changeOf = lineChange(index, line)
          const prefix = `${idPrefix}-${relationKey(line)}`
          return (
            <>
              {spec.line.blocks.map((block, blockIndex) => {
                // Daftar (Voluntary Declaration) tampil setelah isian, lihat di bawah.
                if (isListBlock(block)) return null
                return block.fields.map((item, itemIndex) => {
                  if (isFieldGroup(item)) {
                    return (
                      <CustomsGroupField
                        key={`${blockIndex}-${itemIndex}`}
                        group={item}
                        id={`${prefix}-${item.group}`}
                        value={valueOf}
                        onChange={changeOf}
                        refLabels={refLabels}
                      />
                    )
                  }
                  if (item.kind === "product") {
                    return (
                      <FormField
                        key="product"
                        label={item.label}
                        htmlFor={`${prefix}-product`}
                        span={12}
                        required
                      >
                        <SearchSelect<ProductChoice>
                          id={`${prefix}-product`}
                          endpoint="/api/customs-products"
                          required
                          value={
                            line.product
                              ? { ...line.product, hsCode: line.hsCode, uomCode: "" }
                              : null
                          }
                          onValueChange={(product) =>
                            update(index, {
                              productId: product?.id ?? "",
                              product: product
                                ? { id: product.id, sku: product.sku, name: product.name }
                                : null,
                              itemCode: product?.sku ?? line.itemCode,
                              hsCode: product?.hsCode ?? line.hsCode,
                              description: line.description || product?.name || "",
                            })
                          }
                          getKey={(choice) => choice.id}
                          getLabel={(choice) => `[${choice.sku}] ${choice.name}`}
                          placeholder="Cari product code atau nama produk"
                        />
                      </FormField>
                    )
                  }
                  return (
                    <CustomsFormField
                      key={`${blockIndex}-${itemIndex}`}
                      field={item}
                      id={`${prefix}-${item.key}`}
                      value={valueOf(item)}
                      onChange={changeOf(item)}
                      refLabels={refLabels}
                    />
                  )
                })
              })}
              <CustomsFormField
                field={STOCK_QTY}
                id={`${prefix}-stockQty`}
                value={line.stockQty}
                onChange={changeOf(STOCK_QTY)}
                refLabels={refLabels}
              />
              {spec.line.blocks.map((block, blockIndex) =>
                isListBlock(block) && block.list === "vdEntries" ? (
                  <div key={blockIndex} data-span={12} className="form-field">
                    <RowsEditor
                      title={block.title || "Voluntary Declaration"}
                      idPrefix={`${prefix}-vd`}
                      columns={block.columns}
                      rows={line.vdEntries}
                      onChange={(rows) => update(index, { vdEntries: rows })}
                      newRow={() => emptyRow(CUSTOMS_ROW_KEYS.vdEntries)}
                      refLabels={refLabels}
                      onLabel={onLabel}
                    />
                  </div>
                ) : null,
              )}
              {spec.line.lartas && (
                <div data-span={12} className="form-field">
                  <AttachmentsEditor
                    title={spec.line.lartas.title}
                    columns={spec.line.lartas.columns}
                    documentId={documentId}
                    idPrefix={`${prefix}-lartas`}
                    rows={line.attachments}
                    onChange={(rows) => update(index, { attachments: rows })}
                    refLabels={refLabels}
                    onLabel={onLabel}
                  />
                </div>
              )}
            </>
          )
        }}
      />
    </FormSection>
  )
}

// Tidak ada di form hmx: qty dalam satuan stok produk dipakai gerbang transfer (M4-02).
const STOCK_QTY: CustomsField = {
  key: "stockQty",
  required: true,
  label: "Jumlah dalam Satuan Stok",
  kind: "qty",
  store: "line",
}
