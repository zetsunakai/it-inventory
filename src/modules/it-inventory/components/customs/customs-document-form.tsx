"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useState, type ReactNode } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FormState } from "@/lib/action-result"
import { saveCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import {
  CUSTOMS_STATEMENT_FIELDS,
  emptyLine,
  emptyTransport,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFieldKind,
  type CustomsFormSpec,
  type CustomsLineDraft,
  type CustomsPartyDraft,
  type CustomsPartySpec,
  type CustomsTaxDraft,
} from "@/modules/it-inventory/lib/customs-form"

import { CustomsFormField, type FieldChange, type RefLabels } from "./customs-field"

type ProductChoice = { id: string; sku: string; name: string; hsCode: string; uomCode: string }
type PartnerChoice = { id: string; name: string; identityNumber: string }
type Column<T> = CustomsFieldKind & {
  key: keyof T & string
  label: string
  span?: CustomsField["span"]
}

// Form dokumen BC (backlog M3-04): bagian-bagiannya sama untuk semua jenis seperti tab form hmx,
// isinya diatur spec jenis dokumen. Semua isian disimpan di satu state dan dikirim sebagai JSON;
// Draft boleh belum lengkap (kelengkapan diperiksa aturan validasi saat menuju Siap ajukan).
export function CustomsDocumentForm({
  spec,
  documentId,
  initial,
  initialLabels,
}: {
  spec: CustomsFormSpec
  documentId?: string
  initial: CustomsDocumentDraft
  initialLabels: RefLabels
}) {
  const router = useRouter()
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    saveCustomsDocument,
    null,
  )
  const [draft, setDraft] = useState(initial)
  const [labels, setLabels] = useState(initialLabels)

  useEffect(() => {
    if (state?.ok && !documentId) router.push(`${spec.path}/${state.data.id}`)
  }, [state, documentId, router, spec.path])

  function change<K extends keyof CustomsDocumentDraft>(key: K, value: CustomsDocumentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  // Penangan perubahan untuk isian header (kolom atau details).
  const headerChange =
    (field: CustomsField): FieldChange =>
    (value, label) => {
      if (label) setLabels((current) => ({ ...current, [label.key]: label.name }))
      setDraft((current) =>
        field.detail
          ? { ...current, details: { ...current.details, [field.key]: value } }
          : { ...current, header: { ...current.header, [field.key]: value } },
      )
    }
  const headerValue = (field: CustomsField) =>
    field.detail
      ? (draft.details[field.key] ?? "")
      : ((draft.header as Record<string, string>)[field.key] ?? "")
  const rememberLabel = (label?: { key: string; name: string }) => {
    if (label) setLabels((current) => ({ ...current, [label.key]: label.name }))
  }

  const headerFields = (fields: CustomsField[]) =>
    fields.map((field) => (
      <CustomsFormField
        key={field.key}
        field={field}
        id={fieldId(field.key)}
        value={headerValue(field)}
        onChange={headerChange(field)}
        refLabels={labels}
      />
    ))

  const tabs: { value: string; label: string; content: ReactNode }[] = [
    {
      value: "header",
      label: "Header",
      content: (
        <FormSection title="Header">
          <CustomsFormField
            field={{
              key: "customsOfficeCode",
              label: "Kantor pabean",
              kind: "ref",
              refType: "customs_office",
              span: 6,
            }}
            id={fieldId("customsOfficeCode")}
            value={draft.header.customsOfficeCode}
            onChange={headerChange({
              key: "customsOfficeCode",
              label: "Kantor pabean",
              kind: "ref",
              refType: "customs_office",
            })}
            refLabels={labels}
          />
          {headerFields(spec.header)}
        </FormSection>
      ),
    },
    {
      value: "entitas",
      label: "Entitas",
      content: (
        <div className="divide-y">
          {spec.parties.map((role) => (
            <PartyEditor
              key={role.code}
              role={role}
              idPrefix={fieldId(`party-${role.code}`)}
              party={draft.parties.find((party) => party.entityTypeCode === role.code)}
              refLabels={labels}
              onLabel={rememberLabel}
              onChange={(party) =>
                change("parties", [
                  ...draft.parties.filter((entry) => entry.entityTypeCode !== role.code),
                  party,
                ])
              }
            />
          ))}
        </div>
      ),
    },
    {
      value: "dokumen",
      label: "Dokumen",
      content: (
        <RowsEditor
          title="Dokumen lampiran"
          description="Invoice wajib ada sebelum dokumen bisa diajukan."
          noun="lampiran"
          idPrefix={fieldId("attachment")}
          rows={draft.attachments}
          onChange={(rows) => change("attachments", rows)}
          newRow={() => ({ documentTypeCode: "", number: "", date: "" })}
          refLabels={labels}
          onLabel={rememberLabel}
          columns={[
            {
              key: "documentTypeCode",
              label: "Jenis",
              kind: "ref",
              refType: "document_type",
              span: 6,
            },
            { key: "number", label: "Nomor", kind: "text", span: 3 },
            { key: "date", label: "Tanggal", kind: "date", span: 3 },
          ]}
        />
      ),
    },
  ]

  if (spec.transport) {
    tabs.push({
      value: "pengangkut",
      label: "Pengangkut",
      content: (
        <div className="divide-y">
          <RowsEditor
            title="Sarana angkut"
            noun="sarana angkut"
            idPrefix={fieldId("transport")}
            rows={draft.transports}
            onChange={(rows) => change("transports", rows)}
            newRow={emptyTransport}
            refLabels={labels}
            onLabel={rememberLabel}
            columns={[
              {
                key: "transportModeCode",
                label: "Cara angkut",
                kind: "ref",
                refType: "transport_mode",
                span: 3,
              },
              { key: "name", label: "Nama sarana angkut", kind: "text", span: 3 },
              { key: "voyageNumber", label: "Nomor voyage/flight", kind: "text", span: 3 },
              {
                key: "flagCountryCode",
                label: "Bendera",
                kind: "ref",
                refType: "country",
                span: 3,
              },
            ]}
          />
          {spec.transport.fields.length > 0 && (
            <FormSection title="Pelabuhan dan penimbunan">
              {headerFields(spec.transport.fields)}
            </FormSection>
          )}
        </div>
      ),
    })
  }

  tabs.push(
    {
      value: "kemasan",
      label: spec.containers ? "Kemasan dan peti kemas" : "Kemasan",
      content: (
        <div className="divide-y">
          <RowsEditor
            title="Kemasan"
            noun="kemasan"
            idPrefix={fieldId("package")}
            rows={draft.packages}
            onChange={(rows) => change("packages", rows)}
            newRow={() => ({ qty: "", packageTypeCode: "", marks: "" })}
            refLabels={labels}
            onLabel={rememberLabel}
            columns={[
              { key: "qty", label: "Jumlah", kind: "qty", span: 3 },
              {
                key: "packageTypeCode",
                label: "Jenis kemasan",
                kind: "ref",
                refType: "package_type",
                span: 6,
              },
              { key: "marks", label: "Merek", kind: "text", span: 3 },
            ]}
          />
          {spec.containers && (
            <RowsEditor
              title="Peti kemas"
              noun="peti kemas"
              idPrefix={fieldId("container")}
              rows={draft.containers}
              onChange={(rows) => change("containers", rows)}
              newRow={() => ({ number: "", sizeCode: "", typeCode: "", loadTypeCode: "" })}
              refLabels={labels}
              onLabel={rememberLabel}
              columns={[
                { key: "number", label: "Nomor", kind: "text", mono: true, span: 3 },
                {
                  key: "sizeCode",
                  label: "Ukuran",
                  kind: "ref",
                  refType: "container_size",
                  span: 3,
                },
                {
                  key: "typeCode",
                  label: "Tipe",
                  kind: "ref",
                  refType: "container_type",
                  span: 3,
                },
                {
                  key: "loadTypeCode",
                  label: "Jenis muatan",
                  kind: "option",
                  list: "containerLoad",
                  span: 3,
                },
              ]}
            />
          )}
        </div>
      ),
    },
    {
      value: "barang",
      label: "Barang",
      content: (
        <LinesEditor
          spec={spec}
          idPrefix={fieldId("line")}
          lines={draft.lines}
          onChange={(lines) => change("lines", lines)}
          refLabels={labels}
          onLabel={rememberLabel}
        />
      ),
    },
  )

  if (spec.taxes) {
    tabs.push({
      value: "pungutan",
      label: "Pungutan",
      content: (
        <TaxesEditor
          idPrefix={fieldId("tax")}
          lines={draft.lines}
          onChange={(lines) => change("lines", lines)}
          refLabels={labels}
          onLabel={rememberLabel}
        />
      ),
    })
  }

  tabs.push(
    {
      value: "transaksi",
      label: "Transaksi",
      content: <FormSection title="Transaksi">{headerFields(spec.transaction)}</FormSection>,
    },
    {
      value: "pernyataan",
      label: "Pernyataan",
      content: (
        <FormSection title="Pernyataan">
          {headerFields(CUSTOMS_STATEMENT_FIELDS)}
          <CustomsFormField
            field={{ key: "notes", label: "Catatan", kind: "text", long: true, span: 12 }}
            id={fieldId("notes")}
            value={draft.header.notes}
            onChange={headerChange({ key: "notes", label: "Catatan", kind: "text" })}
            refLabels={labels}
          />
        </FormSection>
      ),
    },
  )

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        {state?.ok && documentId && (
          <p role="status" className="text-control text-success">
            Perubahan disimpan.
          </p>
        )}
      </FormActions>
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      {documentId && <input type="hidden" name="id" value={documentId} />}
      <input type="hidden" name="docCode" value={spec.code} />
      <input type="hidden" name="document" value={JSON.stringify(draft)} />

      <Tabs defaultValue="header">
        <TabsList className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          // Isi tab tetap terpasang supaya pilihan yang belum disimpan tidak hilang saat pindah tab.
          <TabsContent key={tab.value} value={tab.value} keepMounted>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </form>
  )
}

// Entitas satu peran. Peran perusahaan terisi dari profil perusahaan; peran partner dipilih dari
// master partner lalu datanya disalin (bisa diubah tanpa mengubah master).
function PartyEditor({
  role,
  idPrefix,
  party,
  refLabels,
  onLabel,
  onChange,
}: {
  role: CustomsPartySpec
  idPrefix: string
  party: CustomsPartyDraft | undefined
  refLabels: RefLabels
  onLabel: (label?: { key: string; name: string }) => void
  onChange: (party: CustomsPartyDraft) => void
}) {
  const current: CustomsPartyDraft = party ?? {
    entityTypeCode: role.code,
    partnerId: null,
    name: "",
    address: "",
    countryCode: "",
    identityTypeCode: "",
    identityNumber: "",
    nib: "",
    permitNumber: "",
    permitDate: "",
  }
  const [partner, setPartner] = useState<PartnerChoice | null>(
    current.partnerId ? { id: current.partnerId, name: current.name, identityNumber: "" } : null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const set =
    (key: keyof CustomsPartyDraft): FieldChange =>
    (value, label) => {
      onLabel(label)
      onChange({ ...current, [key]: value })
    }

  async function pickPartner(choice: PartnerChoice | null) {
    setPartner(choice)
    setLoadError(null)
    if (!choice) return
    const response = await fetch(`/api/customs-parties?partner=${choice.id}`)
    if (!response.ok) {
      setLoadError("Data partner gagal dimuat. Coba pilih lagi.")
      return
    }
    const data: Pick<
      CustomsPartyDraft,
      "partnerId" | "name" | "address" | "countryCode" | "identityTypeCode" | "identityNumber"
    > = await response.json()
    onChange({ ...current, ...data })
  }

  const field = (
    key: keyof CustomsPartyDraft,
    spec: CustomsFieldKind & { label: string; span?: CustomsField["span"] },
  ) => (
    <CustomsFormField
      field={{ ...spec, key }}
      id={`${idPrefix}-${key}`}
      value={(current[key] as string | null) ?? ""}
      onChange={set(key)}
      refLabels={refLabels}
    />
  )

  return (
    <FormSection
      title={role.label}
      description={role.source === "company" ? "Dari profil perusahaan." : undefined}
    >
      {role.source === "partner" && (
        <FormField
          label="Partner"
          htmlFor={`${idPrefix}-partner`}
          span={12}
          errors={loadError ? [loadError] : undefined}
        >
          <SearchSelect<PartnerChoice>
            id={`${idPrefix}-partner`}
            endpoint="/api/partners"
            value={partner}
            onValueChange={pickPartner}
            getKey={(choice) => choice.id}
            getLabel={(choice) => choice.name}
            placeholder="Cari nama atau NPWP partner"
          />
        </FormField>
      )}
      {field("name", { label: "Nama", kind: "text", span: 6 })}
      {field("identityTypeCode", {
        label: "Jenis identitas",
        kind: "option",
        list: "identityType",
        span: 3,
      })}
      {field("identityNumber", { label: "Nomor identitas", kind: "text", mono: true, span: 3 })}
      {field("address", { label: "Alamat", kind: "text", long: true, span: role.country ? 8 : 12 })}
      {role.country &&
        field("countryCode", { label: "Negara", kind: "ref", refType: "country", span: 4 })}
      {role.permit && (
        <>
          {field("nib", { label: "NIB", kind: "text", mono: true, span: 4 })}
          {field("permitNumber", { label: "Nomor izin TPB", kind: "text", span: 4 })}
          {field("permitDate", { label: "Tanggal izin TPB", kind: "date", span: 4 })}
        </>
      )}
    </FormSection>
  )
}

// Daftar baris sederhana (lampiran, kemasan, peti kemas, sarana angkut): satu kartu per baris.
function RowsEditor<T extends Record<string, string>>({
  title,
  description,
  noun,
  idPrefix,
  rows,
  onChange,
  newRow,
  columns,
  refLabels,
  onLabel,
}: {
  title: string
  description?: string
  noun: string
  idPrefix: string
  rows: T[]
  onChange: (rows: T[]) => void
  newRow: () => T
  columns: Column<T>[]
  refLabels: RefLabels
  onLabel: (label?: { key: string; name: string }) => void
}) {
  return (
    <FormSection
      title={title}
      description={description}
      actions={
        <Button type="button" variant="outline" onClick={() => onChange([...rows, newRow()])}>
          <Plus />
          Tambah {noun}
        </Button>
      }
    >
      {rows.length === 0 && <p className="text-control text-muted-foreground">Belum ada {noun}.</p>}
      {rows.map((row, index) => (
        <RowCard
          key={index}
          label={`${noun} ${index + 1}`}
          onRemove={() => onChange(rows.filter((_, position) => position !== index))}
        >
          {columns.map((column) => (
            <CustomsFormField
              key={column.key}
              field={column}
              id={`${idPrefix}-${index}-${column.key}`}
              value={row[column.key] ?? ""}
              onChange={(value, label) => {
                onLabel(label)
                onChange(
                  rows.map((entry, position) =>
                    position === index ? { ...entry, [column.key]: value } : entry,
                  ),
                )
              }}
              refLabels={refLabels}
            />
          ))}
        </RowCard>
      ))}
    </FormSection>
  )
}

function RowCard({
  label,
  onRemove,
  children,
}: {
  label: string
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <div className="form-grid rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-control font-medium first-letter:uppercase">{label}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Hapus ${label}`}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      {children}
    </div>
  )
}

// Barang: produk siap BC; kode HS dan uraian terisi dari produk, satuan CEISA diisi per baris.
function LinesEditor({
  spec,
  idPrefix,
  lines,
  onChange,
  refLabels,
  onLabel,
}: {
  spec: CustomsFormSpec
  idPrefix: string
  lines: CustomsLineDraft[]
  onChange: (lines: CustomsLineDraft[]) => void
  refLabels: RefLabels
  onLabel: (label?: { key: string; name: string }) => void
}) {
  const update = (index: number, patch: Partial<CustomsLineDraft>) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, ...patch } : line)))

  return (
    <FormSection
      title="Barang"
      description="Hanya produk yang sudah punya kode HS. Jumlah dalam satuan stok dipakai untuk mencocokkan dengan transfer."
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...lines, emptyLine(spec.taxes)])}
        >
          <Plus />
          Tambah barang
        </Button>
      }
    >
      {lines.length === 0 && (
        <p className="text-control text-muted-foreground">Belum ada barang.</p>
      )}
      {lines.map((line, index) => (
        <RowCard
          key={index}
          label={`barang seri ${index + 1}`}
          onRemove={() => onChange(lines.filter((_, position) => position !== index))}
        >
          <FormField label="Produk" htmlFor={`${idPrefix}-${index}-product`} span={12}>
            <SearchSelect<ProductChoice>
              id={`${idPrefix}-${index}-product`}
              endpoint="/api/customs-products"
              value={line.product ? { ...line.product, hsCode: line.hsCode, uomCode: "" } : null}
              onValueChange={(product) =>
                update(index, {
                  productId: product?.id ?? "",
                  product: product
                    ? { id: product.id, sku: product.sku, name: product.name }
                    : null,
                  hsCode: product?.hsCode ?? line.hsCode,
                  description: line.description || product?.name || "",
                })
              }
              getKey={(choice) => choice.id}
              getLabel={(choice) => `[${choice.sku}] ${choice.name}`}
              placeholder="Cari product code atau nama produk"
            />
          </FormField>
          {spec.line.map((field) => (
            <CustomsFormField
              key={field.key}
              field={field}
              id={`${idPrefix}-${index}-${field.key}`}
              value={
                field.detail
                  ? (line.details[field.key] ?? "")
                  : ((line as unknown as Record<string, string>)[field.key] ?? "")
              }
              onChange={(value, label) => {
                onLabel(label)
                update(
                  index,
                  field.detail
                    ? { details: { ...line.details, [field.key]: value } }
                    : ({ [field.key]: value } as Partial<CustomsLineDraft>),
                )
              }}
              refLabels={refLabels}
            />
          ))}
        </RowCard>
      ))}
    </FormSection>
  )
}

// Pungutan per barang: satu baris per jenis pungutan (BM, PPN, PPh, PPnBM).
function TaxesEditor({
  idPrefix,
  lines,
  onChange,
  refLabels,
  onLabel,
}: {
  idPrefix: string
  lines: CustomsLineDraft[]
  onChange: (lines: CustomsLineDraft[]) => void
  refLabels: RefLabels
  onLabel: (label?: { key: string; name: string }) => void
}) {
  const setTaxes = (index: number, taxes: CustomsTaxDraft[]) =>
    onChange(lines.map((line, position) => (position === index ? { ...line, taxes } : line)))

  if (lines.length === 0) {
    return (
      <FormSection title="Pungutan">
        <p className="text-control text-muted-foreground">Tambahkan barang dulu.</p>
      </FormSection>
    )
  }
  return (
    <div className="divide-y">
      {lines.map((line, index) => (
        <RowsEditor
          key={index}
          title={`Seri ${index + 1}${line.product ? ` · ${line.product.sku} ${line.product.name}` : ""}`}
          noun="pungutan"
          idPrefix={`${idPrefix}-${index}`}
          rows={line.taxes}
          onChange={(taxes) => setTaxes(index, taxes)}
          newRow={() => ({
            levyTypeCode: "",
            rate: "",
            facilityCode: "",
            facilityRate: "",
            amount: "",
          })}
          refLabels={refLabels}
          onLabel={onLabel}
          columns={[
            {
              key: "levyTypeCode",
              label: "Jenis pungutan",
              kind: "ref",
              refType: "levy_type",
              span: 4,
            },
            { key: "rate", label: "Tarif (%)", kind: "qty", span: 4 },
            { key: "amount", label: "Nilai", kind: "money", span: 4 },
            {
              key: "facilityCode",
              label: "Fasilitas",
              kind: "option",
              list: "taxFacility",
              span: 4,
            },
            { key: "facilityRate", label: "Tarif fasilitas (%)", kind: "qty", span: 4 },
          ]}
        />
      ))}
    </div>
  )
}
