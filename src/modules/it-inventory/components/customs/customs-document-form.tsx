"use client"

import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { memo, useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection, StaticField } from "@/components/form-field"
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
import { formatDecimal, parseDecimalInput } from "@/lib/decimal"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FormState } from "@/lib/action-result"
import { transferHref } from "@/modules/inventory/lib/transfer"
import type { TransferType } from "@/modules/inventory/lib/inventory"
import { saveCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import {
  CUSTOMS_ROW_KEYS,
  OWNER_CODE,
  customsFieldValue,
  customsLineInputSchema,
  emptyLine,
  formatCustomsValue,
  emptyParty,
  emptyRow,
  isFieldGroup,
  isListBlock,
  sideBySide,
  setCustomsFieldValue,
  syncTransferLines,
  type CustomsBlock,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFieldBlock,
  type CustomsFormSpec,
  type CustomsLineDraft,
  type CustomsRawMaterialDraft,
  type CustomsLineEntityDraft,
  type CustomsLineDutyDraft,
  type CustomsRowDraft,
  type CustomsListBlock,
  type CustomsPartyDraft,
  type CustomsTransferChoice,
  type CustomsTransferProduct,
} from "@/modules/it-inventory/lib/customs-form"
import { CUSTOMS_SOURCE_DOC_CODES } from "@/modules/it-inventory/lib/customs-specs"

import { AttachmentsEditor } from "./attachments-editor"
import { CustomsLineDialog, CustomsLinesTable } from "./customs-lines-table"
import { TransferSelector } from "./transfer-selector"
import {
  CustomsControl,
  CustomsFormField,
  CustomsGroupField,
  type FieldChange,
  type RefLabels,
} from "./customs-field"

type ProductChoice = { id: string; sku: string; name: string; hsCode: string; uomCode: string }
type PartnerChoice = { id: string; name: string; identityNumber: string }
type SourceLineChoice = {
  id: string
  documentId: string
  docCode: string
  documentNumber: string
  internalNumber: string
  ajuNumber: string | null
  registrationDate: string | null
  officeCode: string | null
  officeName: string | null
  sourceSequence: number
  productId: string
  sku: string
  name: string
  hsCode: string
  itemCode: string
  description: string
}

const RAW_MATERIAL_DETAIL_FIELDS: CustomsField[] = [
  {
    key: "officeCode",
    label: "Kode kantor asal",
    kind: "ref",
    refType: "customs_office",
    required: true,
  },
  {
    key: "sourceDocumentCode",
    label: "Kode dokumen asal",
    kind: "ref",
    refType: "document_type",
    required: true,
  },
  {
    key: "sourceDocumentRegistration",
    label: "Nomor daftar dokumen asal",
    kind: "text",
    required: true,
  },
  { key: "registerDate", label: "Tanggal daftar dokumen asal", kind: "date", required: true },
  { key: "sourceDocumentAju", label: "Nomor aju dokumen asal", kind: "text" },
  { key: "sourceProductSerial", label: "Seri barang dokumen asal", kind: "qty" },
  { key: "brand", label: "Merek barang", kind: "text" },
  { key: "productType", label: "Tipe barang", kind: "text" },
  { key: "productSize", label: "Ukuran barang", kind: "text" },
  { key: "extraSpecification", label: "Spesifikasi lain barang", kind: "text", long: true },
  { key: "cifPrice", label: "Nilai CIF", kind: "money" },
  { key: "cifRupiah", label: "CIF Rupiah", kind: "money", readOnly: true },
  { key: "deliveryPrice", label: "Harga penyerahan / harga jual", kind: "money" },
  { key: "acquisitionPrice", label: "Harga perolehan", kind: "money" },
  { key: "serviceValue", label: "Nilai jasa", kind: "money" },
  { key: "freeTax", label: "Dibebaskan", kind: "money" },
  { key: "taxFacilitiesFee", label: "Fasilitas tarif", kind: "ref", refType: "facility" },
  { key: "paidTax", label: "Sudah dilunasi", kind: "money" },
  { key: "taxTypeBM", label: "Jenis pungutan BM", kind: "ref", refType: "levy_type" },
  { key: "ratesType", label: "Jenis tarif BM", kind: "text" },
  { key: "freeTaxBM", label: "BM dibebaskan", kind: "money" },
  { key: "taxFacilitiesFeeBM", label: "Fasilitas tarif BM", kind: "ref", refType: "facility" },
  { key: "paidTaxBM", label: "BM sudah dilunasi", kind: "money" },
  { key: "bmt", label: "BMT", kind: "boolean" },
  { key: "cukai", label: "Cukai", kind: "boolean" },
  { key: "taxTypePPN", label: "Jenis pungutan PPN", kind: "ref", refType: "levy_type" },
  { key: "freeTaxPPN", label: "PPN dibebaskan", kind: "money" },
  { key: "taxFacilitiesFeePPN", label: "Fasilitas tarif PPN", kind: "ref", refType: "facility" },
  { key: "paidTaxPPN", label: "PPN sudah dilunasi", kind: "money" },
  { key: "taxTypePPNBM", label: "Jenis pungutan PPnBM", kind: "ref", refType: "levy_type" },
  { key: "freeTaxPPNBM", label: "PPnBM dibebaskan", kind: "money" },
  {
    key: "taxFacilitiesFeePPNBM",
    label: "Fasilitas tarif PPnBM",
    kind: "ref",
    refType: "facility",
  },
  { key: "taxTypePPH", label: "Jenis pungutan PPh", kind: "ref", refType: "levy_type" },
  { key: "freeTaxPPH", label: "PPh dibebaskan", kind: "money" },
  { key: "taxFacilitiesFeePPH", label: "Fasilitas tarif PPh", kind: "ref", refType: "facility" },
  { key: "paidTaxPPH", label: "PPh sudah dilunasi", kind: "money" },
]
type OnLabel = (label?: { key: string; name: string }) => void

// Form dokumen BC: tab, grup, field, dan label sama dengan form hmx jenisnya (spec dari
// customs-layouts.generated.ts). Semua isian disimpan di satu state dan dikirim sebagai JSON;
// Field wajib mengikuti aturan kelengkapan aktif per jenis dokumen.
export function CustomsDocumentForm({
  spec,
  documentId,
  number,
  companyName,
  initial,
  initialLabels,
  actions,
}: {
  spec: CustomsFormSpec
  documentId?: string
  // Nomor urut IT Inventory; dokumen baru mendapat nomor saat disimpan.
  number?: string
  companyName: string
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
  const [draft, setDraft] = useState(() =>
    identifyRelations({
      ...initial,
      // Baris kosong bawaan diganti tombol Tambah barang; draft yang berisi data tetap dipertahankan.
      lines: initial.lines.filter((line) =>
        Object.values(line).some((value) =>
          typeof value === "string"
            ? value.trim().length > 0
            : value !== null && typeof value === "object" && Object.keys(value).length > 0,
        ),
      ),
    }),
  )
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
  const [sync, setSync] = useState<{ status: "loading" | "done" | "error"; message: string }>()

  // Transfer dipilih (H-04): barang disinkronkan per produk dari permintaan semua transfer terpilih,
  // juga sebelum dokumen pertama kali disimpan (deferred selection hmx).
  async function applyTransfers(transfers: CustomsTransferChoice[]) {
    setDraft((current) => ({ ...current, transfers }))
    if (!transfers.length) {
      setSync(undefined)
      return
    }
    setSync({ status: "loading", message: "Mengisi barang dari transfer…" })
    try {
      const response = await fetch(
        `/api/customs-documents/transfer-products?${new URLSearchParams({
          ids: transfers.map((transfer) => transfer.id).join(","),
        })}`,
      )
      if (!response.ok) throw new Error()
      const { items }: { items: CustomsTransferProduct[] } = await response.json()
      setDraft((current) =>
        identifyRelations({ ...current, lines: syncTransferLines(current.lines, items) }),
      )
      setSync({
        status: "done",
        message: `Barang diisi dari transfer: ${items.length} produk. Periksa tab Barang.`,
      })
    } catch {
      setSync({
        status: "error",
        message: "Barang dari transfer gagal dimuat. Pilih transfer lagi untuk mencoba ulang.",
      })
    }
  }

  const topField = (field: CustomsField) => {
    switch (field.key) {
      case "number":
        return (
          <StaticField
            key={field.key}
            label={field.label}
            value={number ?? "Dibuat saat disimpan"}
            mono={Boolean(number)}
          />
        )
      case "company":
        return <StaticField key={field.key} label={field.label} value={companyName || "—"} />
      case "transfers":
        return (
          <TransfersField
            key={field.key}
            id={fieldId("transfers")}
            label={field.label}
            required={field.required}
            docCode={spec.code}
            transfers={draft.transfers}
            onApply={applyTransfers}
            // Seperti tag many2many hmx: melepas transfer tidak mengubah barang.
            onRemove={(transfers) => setDraft((current) => ({ ...current, transfers }))}
            sync={sync}
          />
        )
      default:
        return (
          <CustomsFormField
            key={field.key}
            field={field}
            id={fieldId(`top-${field.key}`)}
            value={value(field)}
            onChange={fieldChange(field)}
            refLabels={labels}
          />
        )
    }
  }
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
        // Form popup berada di portal dan memvalidasi isian barangnya sendiri.
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("form") !== event.currentTarget
        )
          return
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

      <FormSection>{spec.top.map(topField)}</FormSection>

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

// Inventory Transfer Documents (many2many_tags hmx, H-04): chip transfer terpilih yang bisa
// dilepas, dan tombol yang membuka pemilih transfer.
function TransfersField({
  id,
  label,
  required,
  docCode,
  transfers,
  onApply,
  onRemove,
  sync,
}: {
  id: string
  label: string
  required?: boolean
  docCode: CustomsFormSpec["code"]
  transfers: CustomsTransferChoice[]
  onApply: (transfers: CustomsTransferChoice[]) => void
  onRemove: (transfers: CustomsTransferChoice[]) => void
  sync?: { status: "loading" | "done" | "error"; message: string }
}) {
  const [open, setOpen] = useState(false)
  return (
    <FormField label={label} htmlFor={id} required={required}>
      <div className="flex flex-wrap items-center gap-2">
        {transfers.map((transfer) => (
          <span
            key={transfer.id}
            className="inline-flex h-8 items-center gap-1 rounded-md border bg-muted pl-2.5 text-control"
          >
            <a
              href={transferHref(transfer.type as TransferType, transfer.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-primary underline-offset-4 hover:underline"
            >
              {transfer.number}
            </a>
            <button
              type="button"
              aria-label={`Lepas ${transfer.number}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              onClick={() => onRemove(transfers.filter((entry) => entry.id !== transfer.id))}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={sync?.status === "loading"}
          // Tanpa ini nama tombol diambil dari label field, bukan aksinya.
          aria-label={transfers.length ? "Ubah pilihan transfer" : "Pilih transfer"}
          onClick={() => setOpen(true)}
        >
          {transfers.length ? "Ubah pilihan" : "Pilih transfer"}
        </Button>
      </div>
      {sync && (
        <p
          role={sync.status === "error" ? "alert" : "status"}
          className={
            sync.status === "error"
              ? "text-caption font-medium text-destructive"
              : "text-caption text-muted-foreground"
          }
        >
          {sync.message}
        </p>
      )}
      {open && (
        <TransferSelector
          docCode={docCode}
          selected={transfers}
          onClose={() => setOpen(false)}
          onApply={(selected) => {
            setOpen(false)
            const before = new Set(transfers.map((transfer) => transfer.id))
            const changed =
              selected.length !== before.size || selected.some((row) => !before.has(row.id))
            if (changed) onApply(selected)
          }}
        />
      )}
    </FormField>
  )
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

type RowsProps<Row extends object = CustomsRowDraft> = {
  title: string
  idPrefix: string
  rows: Row[]
  onChange: (rows: Row[]) => void
  newRow: () => Row
  columns: CustomsField[]
  refLabels: RefLabels
  onLabel: OnLabel
  fieldForRow?: (field: CustomsField, row: Row) => CustomsField
  renderControl?: (
    field: CustomsField,
    row: Row,
    index: number,
    update: (patch: Partial<Row>) => void,
  ) => ReactNode
  formatValue?: (field: CustomsField, row: Row) => string | undefined
}

// Seluruh daftar sederhana memakai editor tabel yang sama; metadata baris tidak masuk JSON.
function RowsTable(props: RowsProps) {
  return <RowsEditor {...props} />
}

function RowsEditor<Row extends object>({
  title,
  idPrefix,
  rows,
  onChange,
  newRow,
  columns,
  refLabels,
  onLabel,
  fieldForRow,
  renderControl,
  formatValue,
}: RowsProps<Row>) {
  const valueOf = (row: Row, key: string) => {
    const value = (row as Record<string, unknown>)[key]
    return typeof value === "boolean" ? (value ? "Y" : "") : String(value ?? "")
  }
  const update = (row: Row, patch: Partial<Row>) =>
    onChange(
      rows.map((entry) =>
        relationKey(entry) === relationKey(row) ? { ...entry, ...patch } : entry,
      ),
    )
  return (
    <FormSection title={title}>
      <RelationalTable<Row>
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
              ? valueOf(row, column.key)
              : (formatValue?.(column, row) ??
                formatCustomsValue(column, valueOf(row, column.key), refLabels)),
          render: (row) =>
            formatValue?.(column, row) ??
            formatCustomsValue(column, valueOf(row, column.key), refLabels),
          edit: (row, index) =>
            renderControl?.(column, row, index, (patch) => update(row, patch)) ?? (
              <CustomsControl
                field={fieldForRow?.(column, row) ?? column}
                id={`${idPrefix}-${relationKey(row)}-${column.key}`}
                value={valueOf(row, column.key)}
                ariaLabel={`${column.label} ${title} seri ${index + 1}`}
                refLabels={refLabels}
                onChange={(value, label) => {
                  onLabel(label)
                  update(row, {
                    [column.key]:
                      typeof (row as Record<string, unknown>)[column.key] === "boolean"
                        ? value === "Y"
                        : value,
                  } as Partial<Row>)
                }}
              />
            ),
          footer:
            column.kind === "money"
              ? (items) => formatDecimal(sumDecimals(items.map((row) => valueOf(row, column.key))))
              : undefined,
        }))}
      />
    </FormSection>
  )
}

// Popup mengedit salinan baris. Terapkan mengubah draft dokumen; Batal tidak mengubah daftar.
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
  const [editing, setEditing] = useState<{ key: string | null; line: CustomsLineDraft } | null>(
    null,
  )
  const [lineError, setLineError] = useState("")
  const update = (_index: number, patch: Partial<CustomsLineDraft>) =>
    setEditing((current) => (current ? { ...current, line: { ...current.line, ...patch } } : null))
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

  const renderFields = (line: CustomsLineDraft, index: number) => {
    const valueOf = lineValue(line)
    const changeOf = lineChange(index, line)
    const prefix = `${idPrefix}-${relationKey(line)}`
    const vdBlock = spec.line.blocks.find(
      (block): block is CustomsListBlock => isListBlock(block) && block.list === "vdEntries",
    )
    const sourceLineId = line.details.sourceDocumentLineId ?? ""
    const sourceChoice: SourceLineChoice | null = sourceLineId
      ? {
          id: sourceLineId,
          documentId: "",
          docCode: line.details.documentTypeCode ?? "",
          documentNumber: line.details.sourceDocumentNumber ?? "",
          internalNumber: line.details.sourceDocumentNumber ?? "",
          ajuNumber: line.details.noAju ?? null,
          registrationDate: line.details.registerDate ?? null,
          officeCode: line.details.beacukaiOfficeCode ?? null,
          officeName: null,
          sourceSequence: Number(line.details.sourceSequence ?? 0),
          productId: line.productId,
          sku: line.product?.sku ?? "",
          name: line.product?.name ?? line.description,
          hsCode: line.hsCode,
          itemCode: line.itemCode,
          description: line.description,
        }
      : null
    return (
      <>
        {lineError && (
          <p role="alert" data-span={12} className="text-sm text-destructive">
            {lineError}
          </p>
        )}
        {CUSTOMS_SOURCE_DOC_CODES[spec.code] && (
          <FormField label="Barang dari dokumen asal" htmlFor={`${prefix}-source-line`} span={12}>
            <SearchSelect<SourceLineChoice>
              id={`${prefix}-source-line`}
              endpoint="/api/customs-source-lines"
              params={{ target: spec.code }}
              value={sourceChoice}
              onValueChange={(source) => {
                if (!source) {
                  const details = { ...line.details }
                  for (const key of [
                    "sourceDocumentLineId",
                    "sourceDocumentNumber",
                    "beacukaiOfficeCode",
                    "documentTypeCode",
                    "noAju",
                    "noRegister",
                    "registerDate",
                    "sourceSequence",
                  ])
                    delete details[key]
                  update(index, { details })
                  return
                }
                onLabel({
                  key: `document_type|${source.docCode}`,
                  name: SOURCE_DOC_LABELS[source.docCode] ?? source.docCode,
                })
                if (source.officeCode) {
                  onLabel({
                    key: `customs_office|${source.officeCode}`,
                    name: source.officeName ?? "",
                  })
                }
                update(index, {
                  details: {
                    ...line.details,
                    sourceDocumentLineId: source.id,
                    sourceDocumentNumber: source.documentNumber,
                    beacukaiOfficeCode: source.officeCode ?? "",
                    documentTypeCode: source.docCode,
                    noAju: source.ajuNumber ?? "",
                    noRegister: source.documentNumber,
                    registerDate: source.registrationDate ?? "",
                    sourceSequence: String(source.sourceSequence),
                  },
                  productId: source.productId,
                  product: { id: source.productId, sku: source.sku, name: source.name },
                  itemCode: source.itemCode,
                  hsCode: source.hsCode,
                  description: source.description,
                })
              }}
              getKey={(source) => source.id}
              getLabel={(source) =>
                `[${source.docCode}] ${source.documentNumber} · seri ${source.sourceSequence} · [${source.sku}] ${source.name}`
              }
              placeholder={`Cari dokumen BC ${(CUSTOMS_SOURCE_DOC_CODES[spec.code] ?? []).join(" / ")}, nomor, atau produk`}
            />
          </FormField>
        )}
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
                      line.product ? { ...line.product, hsCode: line.hsCode, uomCode: "" } : null
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
        {vdBlock && (
          <RowsEditor
            title={vdBlock.title || "Voluntary Declaration"}
            idPrefix={`${prefix}-vd`}
            rows={line.vdEntries}
            columns={vdBlock.columns}
            newRow={() => emptyRow(CUSTOMS_ROW_KEYS.vdEntries)}
            refLabels={refLabels}
            onLabel={onLabel}
            onChange={(vdEntries) => update(index, { vdEntries })}
          />
        )}
        {spec.line.lartas && (
          <AttachmentsEditor
            title={spec.line.lartas.title}
            columns={spec.line.lartas.columns.map((field) =>
              field.key === "documentTypeCode" ? { ...field, required: true } : field,
            )}
            documentId={documentId}
            idPrefix={`${prefix}-lartas`}
            rows={line.attachments}
            refLabels={refLabels}
            onLabel={onLabel}
            onChange={(attachments) => update(index, { attachments })}
          />
        )}
        {(["25", "27", "41"] as const).includes(spec.code as "25" | "27" | "41") && (
          <LineChildList<CustomsRawMaterialDraft>
            title="Bahan baku impor/lokal"
            rows={line.rawMaterials}
            fields={["productSerial", "productCode", "description", "quantity"]}
            summary={(material) =>
              [
                material.originCode === "0" ? "Impor" : "Lokal",
                material.productSerial,
                material.hsCode,
                material.description,
                material.quantity,
                material.unitCode,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            requiredFields={[
              "originCode",
              "productCode",
              "hsCode",
              "description",
              "quantity",
              "unitCode",
            ]}
            numericFields={["quantity"]}
            positiveFields={["quantity"]}
            createOptions={[
              {
                label: "Tambah Bahan Baku Impor",
                create: () => ({
                  originCode: "0",
                  productSerial: "",
                  productCode: "",
                  hsCode: "",
                  description: "",
                  quantity: "",
                  unitCode: "",
                  attachments: [],
                  details: {},
                }),
              },
              {
                label: "Tambah Bahan Baku Lokal",
                create: () => ({
                  originCode: "1",
                  productSerial: "",
                  productCode: "",
                  hsCode: "",
                  description: "",
                  quantity: "",
                  unitCode: "",
                  attachments: [],
                  details: {},
                }),
              },
            ]}
            validate={(material) => {
              const missing = RAW_MATERIAL_DETAIL_FIELDS.filter(
                (field) => field.required && !material.details[field.key],
              )
              return missing.length
                ? `Lengkapi: ${missing.map((field) => field.label).join(", ")}.`
                : null
            }}
            create={() => ({
              originCode: "",
              productSerial: "",
              productCode: "",
              hsCode: "",
              description: "",
              quantity: "",
              unitCode: "",
              attachments: [],
              details: {},
            })}
            renderAdditional={(material, updateMaterial) => (
              <div data-span={12}>
                <div className="form-grid mb-4">
                  <CustomsFormField
                    field={{
                      key: "hsCode",
                      label: "Kode HS bahan baku",
                      kind: "ref",
                      refType: "hs_code",
                      required: true,
                    }}
                    id={`${idPrefix}-${relationKey(line)}-material-hs`}
                    value={material.hsCode}
                    onChange={(value, label) => {
                      onLabel(label)
                      updateMaterial({ hsCode: value })
                    }}
                    refLabels={refLabels}
                  />
                  <CustomsFormField
                    field={{
                      key: "unitCode",
                      label: "Satuan CEISA bahan baku",
                      kind: "ref",
                      refType: "ceisa_unit",
                      required: true,
                    }}
                    id={`${idPrefix}-${relationKey(line)}-material-unit`}
                    value={material.unitCode}
                    onChange={(value, label) => {
                      onLabel(label)
                      updateMaterial({ unitCode: value })
                    }}
                    refLabels={refLabels}
                  />
                </div>
                <div className="form-grid mb-4">
                  {RAW_MATERIAL_DETAIL_FIELDS.filter((field) => {
                    const isBc27 = spec.code === "27"
                    const origin = material.originCode
                    const isImportTax = [
                      "cifPrice",
                      "cifRupiah",
                      "taxTypeBM",
                      "ratesType",
                      "freeTaxBM",
                      "taxFacilitiesFeeBM",
                      "paidTaxBM",
                      "bmt",
                      "cukai",
                    ].includes(field.key)
                    const isImportPDRI = [
                      "taxTypePPN",
                      "freeTaxPPN",
                      "taxFacilitiesFeePPN",
                      "paidTaxPPN",
                      "taxTypePPNBM",
                      "freeTaxPPNBM",
                      "taxFacilitiesFeePPNBM",
                      "taxTypePPH",
                      "freeTaxPPH",
                      "taxFacilitiesFeePPH",
                      "paidTaxPPH",
                    ].includes(field.key)
                    const isLocalTax = ["freeTax", "taxFacilitiesFee", "paidTax"].includes(
                      field.key,
                    )
                    if (isImportTax || isImportPDRI) return isBc27 && origin === "0"
                    if (isLocalTax) return isBc27 && origin === "1"
                    return true
                  }).map((field) => (
                    <CustomsFormField
                      key={field.key}
                      field={field}
                      id={`${idPrefix}-${relationKey(line)}-material-${field.key}`}
                      value={material.details[field.key] ?? ""}
                      onChange={(value, label) => {
                        onLabel(label)
                        updateMaterial({
                          details: { ...material.details, [field.key]: value },
                        })
                      }}
                      refLabels={refLabels}
                    />
                  ))}
                </div>
                {spec.code === "27" && material.originCode === "0" && (
                  <AttachmentsEditor
                    title="Dokumen bahan baku"
                    columns={RAW_MATERIAL_ATTACHMENT_FIELDS}
                    documentId={documentId}
                    idPrefix={`${idPrefix}-${relationKey(line)}-raw-material-docs`}
                    rows={material.attachments}
                    onChange={(attachments) => updateMaterial({ attachments })}
                    refLabels={refLabels}
                    onLabel={onLabel}
                  />
                )}
              </div>
            )}
            onChange={(rawMaterials) => update(index, { rawMaterials })}
          />
        )}
        {(["33", "331"] as const).includes(spec.code as "33" | "331") && (
          <RowsEditor<CustomsLineEntityDraft>
            title="Entitas barang"
            idPrefix={`${prefix}-entities`}
            rows={line.entities}
            columns={LINE_ENTITY_FIELDS}
            newRow={() => ({
              entityTypeCode: "",
              partnerId: null,
              name: "",
              address: "",
              identityNumber: "",
              details: {},
            })}
            refLabels={refLabels}
            onLabel={onLabel}
            renderControl={(field, entity, rowIndex, updateEntity) =>
              field.key === "partnerId" ? (
                <SearchSelect<PartnerChoice>
                  id={`${prefix}-${relationKey(entity)}-partner`}
                  ariaLabel={`Partner terkait Entitas barang seri ${rowIndex + 1}`}
                  endpoint="/api/partners"
                  value={
                    entity.partnerId
                      ? {
                          id: entity.partnerId,
                          name: entity.name,
                          identityNumber: entity.identityNumber,
                        }
                      : null
                  }
                  onValueChange={(partner) =>
                    updateEntity({
                      partnerId: partner?.id ?? null,
                      name: partner?.name ?? entity.name,
                      identityNumber: partner?.identityNumber ?? entity.identityNumber,
                    })
                  }
                  getKey={(partner) => partner.id}
                  getLabel={(partner) => partner.name}
                  placeholder="Cari nama atau NPWP partner"
                />
              ) : undefined
            }
            formatValue={(field, entity) =>
              field.key === "partnerId" ? (entity.partnerId ? entity.name : "—") : undefined
            }
            onChange={(entities) => update(index, { entities })}
          />
        )}
        {(["16", "28"] as const).includes(spec.code as "16" | "28") && (
          <RowsEditor<CustomsLineDutyDraft>
            title="Pungutan barang"
            idPrefix={`${prefix}-duties`}
            rows={line.duties}
            columns={LINE_DUTY_FIELDS.map((field) => ({
              ...field,
              required:
                spec.code === "16" &&
                [
                  "taxTypeCode",
                  "rateTypeCode",
                  "exemptAmount",
                  "facilityCode",
                  "paidAmount",
                ].includes(field.key),
            }))}
            newRow={() => ({
              levyCode: spec.code === "16" ? "bm" : "other",
              taxTypeCode: spec.code === "16" ? "BM" : "",
              rateTypeCode: "",
              rate: "",
              exemptAmount: "",
              facilityCode: "",
              paidAmount: "",
              bmt: false,
              excise: false,
              details: {},
            })}
            fieldForRow={(field, duty) =>
              field.key === "taxTypeCode"
                ? {
                    ...field,
                    kind: "ref",
                    refType: "levy_type",
                    codes: DUTY_TYPE_CODES[duty.levyCode],
                  }
                : field
            }
            renderControl={(field, duty, rowIndex, updateDuty) =>
              field.key === "levyCode" ? (
                <select
                  id={`${prefix}-${relationKey(duty)}-levy`}
                  aria-label={`Kelompok pungutan Pungutan barang seri ${rowIndex + 1}`}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={duty.levyCode}
                  onChange={(event) => {
                    const levyCode = event.target.value as CustomsLineDutyDraft["levyCode"]
                    updateDuty({ levyCode, taxTypeCode: DUTY_TYPE_CODES[levyCode]?.[0] ?? "" })
                  }}
                >
                  {Object.entries(DUTY_GROUP_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
            formatValue={(field, duty) =>
              field.key === "levyCode" ? DUTY_GROUP_LABELS[duty.levyCode] : undefined
            }
            refLabels={refLabels}
            onLabel={onLabel}
            onChange={(duties) => update(index, { duties })}
          />
        )}
      </>
    )
  }

  return (
    <FormSection
      title={title}
      description="Hanya produk yang sudah punya kode HS. Terisi dari permintaan transfer yang dipilih di header."
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLineError("")
            setEditing({ key: null, line: newRelation(emptyLine()) })
          }}
        >
          <Plus />
          Tambah barang
        </Button>
      }
    >
      <CustomsLinesTable
        id={`bc-${spec.code}-barang`}
        title={title}
        rows={lines.map((line) => ({
          key: relationKey(line),
          product: line.product ? `[${line.product.sku}] ${line.product.name}` : "—",
          hsCode: line.hsCode,
          description: line.description,
          stockQty: line.stockQty,
        }))}
        onOpen={(key) => {
          const line = lines.find((line) => relationKey(line) === key)
          if (line) {
            setLineError("")
            setEditing({ key, line: { ...line, details: { ...line.details } } })
          }
        }}
      />
      {editing && (
        <CustomsLineDialog
          title={editing.key ? "Edit barang" : "Tambah barang"}
          onClose={() => setEditing(null)}
          onApply={() => {
            const qty = parseDecimalInput(editing.line.qty, 4)
            const stockQty = parseDecimalInput(editing.line.stockQty, 4)
            if (
              !editing.line.productId ||
              !qty ||
              Number(qty) <= 0 ||
              !stockQty ||
              Number(stockQty) <= 0
            ) {
              setLineError(
                "Pilih produk serta isi jumlah CEISA dan jumlah satuan stok lebih dari nol.",
              )
              return
            }
            // Validasi payload yang dikirim; Symbol identitas tabel bukan bagian dari input.
            const parsed = customsLineInputSchema.safeParse(
              JSON.parse(JSON.stringify(editing.line)),
            )
            if (!parsed.success) {
              setLineError(parsed.error.issues[0].message)
              return
            }
            onChange(
              editing.key
                ? lines.map((line) => (relationKey(line) === editing.key ? editing.line : line))
                : [...lines, editing.line],
            )
            setEditing(null)
          }}
          onRemove={
            editing.key
              ? () => {
                  onChange(lines.filter((line) => relationKey(line) !== editing.key))
                  setEditing(null)
                }
              : undefined
          }
        >
          {renderFields(editing.line, 0)}
        </CustomsLineDialog>
      )}
    </FormSection>
  )
}

function LineChildList<T extends object>({
  title,
  rows,
  fields,
  create,
  createOptions,
  summary,
  requiredFields = [],
  numericFields = [],
  positiveFields = [],
  validate,
  renderAdditional,
  onChange,
}: {
  title: string
  rows: T[]
  fields: (keyof T)[]
  create: () => T
  createOptions?: { label: string; create: () => T }[]
  summary?: (row: T) => string
  requiredFields?: (keyof T)[]
  numericFields?: (keyof T)[]
  positiveFields?: (keyof T)[]
  validate?: (row: T) => string | null
  renderAdditional?: (row: T, onChange: (patch: Partial<T>) => void) => ReactNode
  onChange: (rows: T[]) => void
}) {
  const tableId = useId()
  const [childDraft, setChildDraft] = useState<{ index: number | null; row: T } | null>(null)
  const [childError, setChildError] = useState("")
  const updateChildDraft = (row: T) => {
    setChildDraft((current) => (current ? { ...current, row } : null))
    setChildError("")
  }
  const label = (key: keyof T) =>
    RAW_MATERIAL_FIELD_LABELS[String(key)] ??
    String(key).replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
  const applyChildDraft = () => {
    if (!childDraft) return
    const values = childDraft.row as Record<string, unknown>
    const missing = requiredFields.filter((field) => {
      const value = values[String(field)]
      return value === null || value === undefined || value === ""
    })
    if (missing.length) {
      setChildError(`Lengkapi: ${missing.map(label).join(", ")}.`)
      return
    }
    const customError = validate?.(childDraft.row)
    if (customError) {
      setChildError(customError)
      return
    }
    const invalidNumber = numericFields.find((field) => {
      const value = values[String(field)]
      return typeof value === "string" && value !== "" && parseDecimalInput(value, 4) === null
    })
    if (invalidNumber) {
      setChildError(`${label(invalidNumber)} harus berupa angka yang valid.`)
      return
    }
    const nonPositive = positiveFields.find((field) => {
      const value = values[String(field)]
      const parsed = typeof value === "string" ? parseDecimalInput(value, 4) : null
      return parsed === null || Number(parsed) <= 0
    })
    if (nonPositive) {
      setChildError(`${label(nonPositive)} harus lebih dari nol.`)
      return
    }
    onChange(
      childDraft.index === null
        ? [...rows, childDraft.row]
        : rows.map((row, index) => (index === childDraft.index ? childDraft.row : row)),
    )
    setChildDraft(null)
  }
  const cancelChildDraft = () => {
    setChildDraft(null)
    setChildError("")
  }
  const draftEditor = childDraft ? (
    <>
      {childError && (
        <p role="alert" data-span={12} className="text-sm text-destructive">
          {childError}
        </p>
      )}
      {fields.map((field) => {
        const values = childDraft.row as Record<string, unknown>
        const id = `${title}-draft-${String(field)}`
        return (
          <FormField key={String(field)} label={label(field)} htmlFor={id}>
            {typeof values[String(field)] === "boolean" ? (
              <input
                id={id}
                type="checkbox"
                checked={values[String(field)] as boolean}
                onChange={(event) =>
                  updateChildDraft({ ...childDraft.row, [field]: event.target.checked })
                }
              />
            ) : (
              <input
                id={id}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={
                  typeof values[String(field)] === "string" ? (values[String(field)] as string) : ""
                }
                onChange={(event) =>
                  updateChildDraft({ ...childDraft.row, [field]: event.target.value })
                }
              />
            )}
          </FormField>
        )
      })}
      {renderAdditional?.(childDraft.row, (patch) =>
        setChildDraft({ ...childDraft, row: { ...childDraft.row, ...patch } }),
      )}
      <div data-span={12} className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={cancelChildDraft}>
          Batal
        </Button>
        <Button type="button" onClick={applyChildDraft}>
          Terapkan baris
        </Button>
      </div>
    </>
  ) : null
  return (
    <section data-span={12} className="rounded-lg border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap gap-2">
          {(createOptions ?? [{ label: "Tambah", create }]).map((option) => (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setChildError("")
                setChildDraft({ index: null, row: newRelation(option.create()) })
              }}
            >
              <Plus /> {option.label}
            </Button>
          ))}
        </div>
      </div>
      <RelationalTable<T>
        id={`bc-child-${tableId}`}
        label={title}
        rows={rows}
        rowKey={relationKey}
        readOnly
        onReorder={onChange}
        onRemove={(keys) => onChange(rows.filter((row) => !keys.includes(relationKey(row))))}
        columns={[
          {
            id: "details",
            label: "Bahan baku",
            value: (row) => summary?.(row) ?? "Rincian bahan baku",
            render: (row, rowIndex) => (
              <button
                type="button"
                className="block min-h-9 w-full truncate text-left text-primary hover:underline"
                onClick={() => {
                  setChildError("")
                  setChildDraft({ index: rowIndex, row: { ...row } })
                }}
              >
                {summary?.(row) || "Rincian bahan baku"}
              </button>
            ),
          },
          ...fields.map((field) => ({
            id: String(field),
            label: label(field),
            numeric: numericFields.includes(field),
            value: (row: T) => String((row as Record<string, unknown>)[String(field)] ?? ""),
          })),
        ]}
      />
      {childDraft && (
        <CustomsLineDialog
          title={`${childDraft.index === null ? "Tambah" : "Edit"} ${title.toLowerCase()}`}
          onClose={cancelChildDraft}
          onApply={applyChildDraft}
        >
          {draftEditor}
        </CustomsLineDialog>
      )}
    </section>
  )
}

// Tidak ada di form hmx: qty dalam satuan stok produk, terisi dari transfer yang dipilih (H-04).
const STOCK_QTY: CustomsField = {
  key: "stockQty",
  required: true,
  label: "Jumlah dalam Satuan Stok",
  kind: "qty",
  store: "line",
}

const RAW_MATERIAL_ATTACHMENT_FIELDS: CustomsField[] = [
  {
    key: "documentTypeCode",
    label: "Jenis Dokumen",
    kind: "ref",
    refType: "document_type",
  },
  { key: "number", label: "Nomor", kind: "text" },
  { key: "date", label: "Tanggal", kind: "date" },
  { key: "facilityCode", label: "Fasilitas", kind: "ref", refType: "facility" },
  { key: "permit", label: "No. urut di izin", kind: "text" },
  { key: "officeCode", label: "Kode Kantor", kind: "text" },
  { key: "file", label: "File", kind: "file" },
]

const LINE_ENTITY_FIELDS: CustomsField[] = [
  {
    key: "entityTypeCode",
    label: "Jenis entitas",
    kind: "ref",
    refType: "entity_type",
    required: true,
  },
  { key: "partnerId", label: "Partner terkait", kind: "text" },
  { key: "name", label: "Nama", kind: "text", required: true },
  { key: "address", label: "Alamat", kind: "text", long: true },
  { key: "identityNumber", label: "Nomor identitas", kind: "text" },
]

const LINE_DUTY_FIELDS: CustomsField[] = [
  { key: "levyCode", label: "Kelompok pungutan", kind: "text" },
  { key: "taxTypeCode", label: "Jenis pungutan CEISA", kind: "ref", refType: "levy_type" },
  { key: "rateTypeCode", label: "Jenis tarif", kind: "text" },
  { key: "rate", label: "Tarif", kind: "qty" },
  { key: "exemptAmount", label: "Dibebaskan", kind: "money" },
  { key: "facilityCode", label: "Fasilitas tarif", kind: "ref", refType: "facility" },
  { key: "paidAmount", label: "Sudah dilunasi", kind: "money" },
  { key: "bmt", label: "BMT", kind: "boolean" },
  { key: "excise", label: "Cukai", kind: "boolean" },
]

const DUTY_GROUP_LABELS: Record<CustomsLineDutyDraft["levyCode"], string> = {
  bm: "Bea Masuk",
  ppn: "PPN",
  ppnbm: "PPnBM",
  pph: "PPh",
  cukai: "Cukai",
  other: "Lainnya",
}

const RAW_MATERIAL_FIELD_LABELS: Record<string, string> = {
  productSerial: "Seri barang",
  productCode: "Kode barang",
  description: "Uraian",
  quantity: "Jumlah",
}

const DUTY_TYPE_CODES: Partial<Record<CustomsLineDutyDraft["levyCode"], readonly string[]>> = {
  bm: ["BM"],
  ppn: ["PPN"],
  ppnbm: ["PPNBM"],
  pph: ["PPH"],
  cukai: ["CUKAI"],
}

const SOURCE_DOC_LABELS: Record<string, string> = {
  "16": "BC 1.6",
  "27": "BC 2.7",
  "33": "BC 3.3",
  "40": "BC 4.0",
}
