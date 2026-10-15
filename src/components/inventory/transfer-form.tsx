"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useRef, useState } from "react"

import { saveTransfer } from "@/app/(app)/inventory/actions"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fieldValue, type FormState } from "@/lib/action-result"
import { formatDecimal, toDecimalInput } from "@/lib/decimal"
import { MANUAL_USAGE_TYPES, USAGE_TYPE_LABELS, type UsageType } from "@/lib/inventory"
import type { TransferKind, TransferLineDraft } from "@/lib/transfer"
import type {
  LocationOption,
  PartnerChoice,
  ProductChoice,
  StockAvailability,
  UomChoice,
} from "@/server/queries/transfers"

export type TransferFormValues = {
  id: string
  partner: PartnerChoice | null
  locationId: string
  // Lokasi tujuan transfer internal.
  otherLocationId?: string
  scheduledDate: string | null
  reference: string | null
  notes: string | null
  reason?: string | null
  usageType?: UsageType | null
  direction?: "increase" | "decrease"
  lines: { product: ProductChoice; inputQty: string; uomId: string; lotName: string | null }[]
}

type Line = {
  key: string
  product: ProductChoice | null
  inputQty: string
  uomId: string
  lotName: string
}

// Kunci baris harus sama di server dan client (hidrasi), jadi dari penghitung, bukan acak.
const newLine = (key: string): Line => ({
  key,
  product: null,
  inputQty: "",
  uomId: "",
  lotName: "",
})

const USAGE_ITEMS = MANUAL_USAGE_TYPES.map((value) => ({
  value,
  label: USAGE_TYPE_LABELS[value],
}))

const DIRECTION_ITEMS = [
  { value: "decrease", label: "Kurangi stok (hilang, rusak, selisih kurang)" },
  { value: "increase", label: "Tambah stok (ditemukan, selisih lebih)" },
]

// Target sentuh lebih besar di tablet/HP (admin gudang menerima barang sambil memegang perangkat).
const TOUCH = "pointer-coarse:h-11"

// Form transfer Draft: header dan baris barang (backlog M2-03). Dipakai untuk membuat dan mengubah.
export function TransferForm({
  kind,
  locations,
  uoms,
  transfer,
}: {
  kind: TransferKind
  locations: LocationOption[]
  uoms: UomChoice[]
  transfer?: TransferFormValues
}) {
  const router = useRouter()
  // Id unik per form: router menyimpan halaman sebelumnya tersembunyi di DOM, jadi id tetap
  // bisa kembar dan label menunjuk ke input yang salah.
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    saveTransfer,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [partner, setPartner] = useState(transfer?.partner ?? null)
  const [locationId, setLocationId] = useState<string | null>(transfer?.locationId ?? null)
  const [otherLocationId, setOtherLocationId] = useState<string | null>(
    transfer?.otherLocationId ?? null,
  )
  // Pemakaian & scrap: susut transit tidak dibuat dari form ini (R-12).
  const [usageType, setUsageType] = useState<string | null>(transfer?.usageType ?? "scrap")
  const [direction, setDirection] = useState<string | null>(transfer?.direction ?? null)
  // Barang keluar dari lokasi gudang: lot dipilih dari stok yang ada.
  const outbound = kind.directional ? direction !== "increase" : kind.locationSide === "source"
  const nextKey = useRef(transfer?.lines.length || 1)
  const [lines, setLines] = useState<Line[]>(() =>
    transfer?.lines.length
      ? transfer.lines.map((line, index) => ({
          key: `line-${index}`,
          product: line.product,
          inputQty: toDecimalInput(line.inputQty),
          uomId: line.uomId,
          lotName: line.lotName ?? "",
        }))
      : [newLine("line-0")],
  )

  useEffect(() => {
    if (!state?.ok) return
    if (!transfer) router.push(`${kind.path}/${state.data.id}`)
  }, [state, transfer, router, kind.path])

  const locationItems = locations.map((location) => ({
    value: location.id,
    label: `${location.path} · ${location.warehouseName}${location.isBonded ? " (berikat)" : ""}`,
  }))
  // Pindah lokasi (R-09): tujuan hanya lokasi lain di gudang lokasi asal.
  const sourceWarehouse = locations.find((location) => location.id === locationId)?.warehouseId
  const destinationItems = kind.sameWarehouse
    ? locationItems.filter((item) =>
        locations.some(
          (location) =>
            location.id === item.value &&
            location.warehouseId === sourceWarehouse &&
            location.id !== locationId,
        ),
      )
    : locationItems
  const payload: TransferLineDraft[] = lines.map((line) => ({
    productId: line.product?.id ?? "",
    inputQty: line.inputQty,
    uomId: line.uomId,
    lotName: line.lotName,
  }))

  function update(key: string, change: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))
  }

  return (
    <form action={formAction} className="max-w-5xl space-y-6">
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      {transfer && <input type="hidden" name="id" value={transfer.id} />}
      <input type="hidden" name="type" value={kind.type} />
      <input type="hidden" name="partnerId" value={partner?.id ?? ""} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <FormSection title={`Data ${kind.noun}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          {kind.usageTypes && (
            <FormField
              label="Jenis pemakaian"
              htmlFor={fieldId("transfer-usage")}
              errors={fieldErrors?.usageType}
            >
              <Select
                name="usageType"
                items={USAGE_ITEMS}
                value={usageType}
                onValueChange={setUsageType}
              >
                <SelectTrigger id={fieldId("transfer-usage")} className="w-full">
                  <SelectValue placeholder="Pilih jenis pemakaian" />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {kind.directional && (
            <FormField
              label="Arah"
              htmlFor={fieldId("transfer-direction")}
              errors={fieldErrors?.direction}
            >
              <Select
                name="direction"
                items={DIRECTION_ITEMS}
                value={direction}
                onValueChange={setDirection}
              >
                <SelectTrigger id={fieldId("transfer-direction")} className="w-full">
                  <SelectValue placeholder="Tambah atau kurangi stok" />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTION_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          {kind.partnerRole && (
            <FormField label={kind.partnerLabel ?? "Partner"} htmlFor={fieldId("transfer-partner")}>
              <SearchSelect<PartnerChoice>
                id={fieldId("transfer-partner")}
                endpoint="/api/partners"
                params={{ role: kind.partnerRole }}
                value={partner}
                onValueChange={setPartner}
                getKey={(item) => item.id}
                getLabel={(item) => `[${item.code}] ${item.name}`}
                placeholder={`Cari kode atau nama ${kind.partnerRole}`}
              />
            </FormField>
          )}
          <FormField
            label={kind.locationLabel}
            htmlFor={fieldId("transfer-location")}
            errors={fieldErrors?.locationId}
          >
            <Select
              name="locationId"
              items={locationItems}
              value={locationId}
              onValueChange={setLocationId}
            >
              <SelectTrigger id={fieldId("transfer-location")} className="w-full">
                <SelectValue placeholder="Pilih lokasi gudang" />
              </SelectTrigger>
              <SelectContent>
                {locationItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {kind.secondLocationLabel && (
            <FormField
              label={kind.secondLocationLabel}
              htmlFor={fieldId("transfer-other-location")}
              errors={fieldErrors?.otherLocationId}
            >
              <Select
                name="otherLocationId"
                items={destinationItems}
                value={otherLocationId}
                onValueChange={setOtherLocationId}
              >
                <SelectTrigger id={fieldId("transfer-other-location")} className="w-full">
                  <SelectValue
                    placeholder={
                      kind.sameWarehouse && !locationId ? "Pilih lokasi asal dulu" : "Pilih lokasi"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {destinationItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField
            label="Tanggal rencana"
            htmlFor={fieldId("transfer-date")}
            errors={fieldErrors?.scheduledDate}
          >
            <Input
              id={fieldId("transfer-date")}
              name="scheduledDate"
              type="date"
              defaultValue={fieldValue(state, "scheduledDate", transfer?.scheduledDate)}
            />
          </FormField>
          <FormField
            label={kind.partnerRole ? "Referensi PO/SO" : "Referensi"}
            htmlFor={fieldId("transfer-reference")}
            errors={fieldErrors?.reference}
          >
            <Input
              id={fieldId("transfer-reference")}
              name="reference"
              defaultValue={fieldValue(state, "reference", transfer?.reference)}
            />
          </FormField>
        </div>
        {kind.needsApproval && (
          <FormField
            label="Alasan"
            htmlFor={fieldId("transfer-reason")}
            errors={fieldErrors?.reason}
            hint="Wajib. Dibaca Manajer saat menyetujui dan tercatat di laporan penyesuaian."
          >
            <Textarea
              id={fieldId("transfer-reason")}
              name="reason"
              rows={2}
              defaultValue={fieldValue(state, "reason", transfer?.reason)}
            />
          </FormField>
        )}
        <FormField label="Catatan" htmlFor={fieldId("transfer-notes")} errors={fieldErrors?.notes}>
          <Textarea
            id={fieldId("transfer-notes")}
            name="notes"
            rows={2}
            defaultValue={fieldValue(state, "notes", transfer?.notes)}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Barang"
        description="Qty boleh dalam satuan lain dari kategori yang sama; disimpan dalam satuan stok produk."
      >
        <div className="space-y-3">
          <div
            aria-hidden
            className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_10rem_2.25rem] gap-2 text-caption font-medium text-muted-foreground md:grid"
          >
            <span>Produk</span>
            <span>Qty</span>
            <span>Satuan</span>
            <span>Nomor lot</span>
          </div>
          {lines.map((line, index) => {
            const label = `baris ${index + 1}`
            const uomItems = uoms
              .filter(
                (uom) =>
                  uom.categoryId === line.product?.uomCategoryId &&
                  (!uom.productId || uom.productId === line.product.id),
              )
              .map((uom) => ({ value: uom.id, label: uom.code }))
            return (
              <div
                key={line.key}
                className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_7rem_8rem_10rem_2.25rem] md:border-0 md:p-0"
              >
                <div className="col-span-2 md:col-span-1">
                  <SearchSelect<ProductChoice>
                    id={fieldId(`product-${line.key}`)}
                    endpoint="/api/products"
                    value={line.product}
                    onValueChange={(product) =>
                      update(line.key, { product, uomId: product?.uomId ?? "" })
                    }
                    getKey={(item) => item.id}
                    getLabel={(item) => `[${item.sku}] ${item.name}`}
                    placeholder="Cari SKU atau nama produk"
                  />
                  <label htmlFor={fieldId(`product-${line.key}`)} className="sr-only">
                    Produk {label}
                  </label>
                </div>
                <Input
                  aria-label={`Qty ${label}`}
                  inputMode="decimal"
                  placeholder="Qty"
                  value={line.inputQty}
                  onChange={(event) => update(line.key, { inputQty: event.target.value })}
                  className={`text-right tabular-nums ${TOUCH}`}
                />
                <Select
                  items={uomItems}
                  value={line.uomId || null}
                  onValueChange={(value) => update(line.key, { uomId: value ?? "" })}
                  disabled={!line.product}
                >
                  <SelectTrigger aria-label={`Satuan ${label}`} className={`w-full ${TOUCH}`}>
                    <SelectValue placeholder="Satuan" />
                  </SelectTrigger>
                  <SelectContent>
                    {uomItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {outbound ? (
                  <OutboundLot
                    label={label}
                    product={line.product}
                    locationId={locationId}
                    value={line.lotName}
                    onChange={(lotName) => update(line.key, { lotName })}
                  />
                ) : (
                  <Input
                    aria-label={`Nomor lot ${label}`}
                    placeholder={lotPlaceholder(line.product)}
                    value={line.lotName}
                    onChange={(event) => update(line.key, { lotName: event.target.value })}
                    className={`font-mono ${TOUCH}`}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus ${label}`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) => current.filter((item) => item.key !== line.key))
                  }
                  className="justify-self-end pointer-coarse:size-11"
                >
                  <Trash2 />
                </Button>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setLines((current) => [...current, newLine(`line-${nextKey.current++}`)])
            }
            className={TOUCH}
          >
            <Plus />
            Tambah baris
          </Button>
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className={TOUCH}>
          {pending ? "Menyimpan…" : transfer ? "Simpan perubahan" : `Simpan ${kind.noun}`}
        </Button>
        {state?.ok && transfer && (
          <p role="status" className="text-sm text-success">
            Perubahan disimpan.
          </p>
        )}
      </div>
    </form>
  )
}

// Petunjuk isi lot barang masuk sesuai pelacakan produk.
function lotPlaceholder(product: ProductChoice | null) {
  if (!product || product.tracking === "none") return "Lot"
  const noun = product.tracking === "serial" ? "No. seri" : "Lot"
  return product.lotAuto ? `${noun} (otomatis)` : `${noun} (wajib)`
}

const NO_LOT = "__tanpa_lot__"

// Lot barang keluar dipilih dari lot yang masih ada stoknya di lokasi asal, dengan petunjuk
// jumlah tersedia (PRD bagian 6: cek ketersediaan stok). Pengecekan yang menentukan tetap di
// database saat Siap dan validasi.
function OutboundLot({
  label,
  product,
  locationId,
  value,
  onChange,
}: {
  label: string
  product: ProductChoice | null
  locationId: string | null
  value: string
  onChange: (lotName: string) => void
}) {
  const [stock, setStock] = useState<StockAvailability | null>(null)
  const productId = product?.id

  useEffect(() => {
    if (!productId || !locationId) return
    const controller = new AbortController()
    fetch(
      `/api/stock-availability?${new URLSearchParams({ product: productId, location: locationId })}`,
      {
        signal: controller.signal,
      },
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((body: StockAvailability | null) => setStock(body))
      .catch(() => {})
    return () => controller.abort()
  }, [productId, locationId])

  const current = productId && locationId ? stock : null
  const lots = current?.lots ?? []
  // Lot yang sudah tersimpan tetap bisa dipilih walau stoknya sudah habis.
  const items = [
    { value: NO_LOT, label: "Tanpa lot" },
    ...lots.map((lot) => ({ value: lot.name, label: `${lot.name} (${formatDecimal(lot.qty)})` })),
    ...(value && !lots.some((lot) => lot.name === value) ? [{ value, label: value }] : []),
  ]

  return (
    <div className="space-y-1">
      <Select
        items={items}
        value={value || NO_LOT}
        onValueChange={(next) => onChange(next && next !== NO_LOT ? next : "")}
        disabled={!product || !locationId}
      >
        <SelectTrigger aria-label={`Nomor lot ${label}`} className={`w-full font-mono ${TOUCH}`}>
          <SelectValue placeholder="Lot" />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current && (
        <p className="text-caption text-muted-foreground">
          Tersedia {formatDecimal(current.qty)} {current.uomCode}
        </p>
      )}
    </div>
  )
}
