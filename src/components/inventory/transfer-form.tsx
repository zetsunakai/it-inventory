"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"

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
import { toDecimalInput } from "@/lib/decimal"
import type { TransferKind, TransferLineDraft } from "@/lib/transfer"
import type {
  LocationOption,
  PartnerChoice,
  ProductChoice,
  UomChoice,
} from "@/server/queries/transfers"

export type TransferFormValues = {
  id: string
  partner: PartnerChoice | null
  locationId: string
  scheduledDate: string | null
  reference: string | null
  notes: string | null
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
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    saveTransfer,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [partner, setPartner] = useState(transfer?.partner ?? null)
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
          {kind.partnerRole && (
            <FormField label={kind.partnerLabel ?? "Partner"} htmlFor="transfer-partner">
              <SearchSelect<PartnerChoice>
                id="transfer-partner"
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
            htmlFor="transfer-location"
            errors={fieldErrors?.locationId}
          >
            <Select
              name="locationId"
              items={locationItems}
              defaultValue={fieldValue(state, "locationId", transfer?.locationId) ?? null}
            >
              <SelectTrigger id="transfer-location" className="w-full">
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
          <FormField
            label="Tanggal rencana"
            htmlFor="transfer-date"
            errors={fieldErrors?.scheduledDate}
          >
            <Input
              id="transfer-date"
              name="scheduledDate"
              type="date"
              defaultValue={fieldValue(state, "scheduledDate", transfer?.scheduledDate)}
            />
          </FormField>
          <FormField
            label="Referensi PO/SO"
            htmlFor="transfer-reference"
            errors={fieldErrors?.reference}
          >
            <Input
              id="transfer-reference"
              name="reference"
              defaultValue={fieldValue(state, "reference", transfer?.reference)}
            />
          </FormField>
        </div>
        <FormField label="Catatan" htmlFor="transfer-notes" errors={fieldErrors?.notes}>
          <Textarea
            id="transfer-notes"
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
            className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_10rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground md:grid"
          >
            <span>Produk</span>
            <span>Qty</span>
            <span>Satuan</span>
            <span>Nomor lot</span>
          </div>
          {lines.map((line, index) => {
            const label = `baris ${index + 1}`
            const uomItems = uoms
              .filter((uom) => uom.categoryId === line.product?.uomCategoryId)
              .map((uom) => ({ value: uom.id, label: uom.code }))
            return (
              <div
                key={line.key}
                className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_7rem_8rem_10rem_2.25rem] md:border-0 md:p-0"
              >
                <div className="col-span-2 md:col-span-1">
                  <SearchSelect<ProductChoice>
                    id={`line-product-${line.key}`}
                    endpoint="/api/products"
                    value={line.product}
                    onValueChange={(product) =>
                      update(line.key, { product, uomId: product?.uomId ?? "" })
                    }
                    getKey={(item) => item.id}
                    getLabel={(item) => `[${item.sku}] ${item.name}`}
                    placeholder="Cari SKU atau nama produk"
                  />
                  <label htmlFor={`line-product-${line.key}`} className="sr-only">
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
                <Input
                  aria-label={`Nomor lot ${label}`}
                  placeholder={line.product?.lotRequired ? "Lot (wajib)" : "Lot"}
                  value={line.lotName}
                  onChange={(event) => update(line.key, { lotName: event.target.value })}
                  className={`font-mono ${TOUCH}`}
                />
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
