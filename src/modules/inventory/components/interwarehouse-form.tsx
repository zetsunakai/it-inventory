"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId, useRef, useState } from "react"

import { saveInterwarehouse } from "@/modules/inventory/actions/interwarehouse"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { RelationalTable, type RelationColumn } from "@/components/relational/relational-table"
import { sumDecimals } from "@/components/relational/relational-utils"
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
import type { TransferLineDraft } from "@/modules/inventory/lib/transfer"
import type {
  LocationOption,
  ProductChoice,
  UomChoice,
} from "@/modules/inventory/server/queries/transfers"
import { FORM_CLASS, FormActions, FormColumn, FormColumns } from "@/components/layout/form-layout"

export type InterwarehouseFormValues = {
  id: string
  sourceLocationId: string
  destinationLocationId: string
  scheduledDate: string | null
  reference: string | null
  notes: string | null
  lines: { product: ProductChoice; inputQty: string; uomId: string }[]
}

type Line = { key: string; product: ProductChoice | null; inputQty: string; uomId: string }

const TOUCH = "pointer-coarse:h-11"

// Form permintaan transfer antar gudang Draft (backlog R-10): lokasi asal dan tujuan di gudang
// berbeda, baris barang tanpa lot (lot dipilih reservasi saat Konfirmasi, lot terlama dulu).
export function InterwarehouseForm({
  locations,
  uoms,
  request,
}: {
  locations: LocationOption[]
  uoms: UomChoice[]
  request?: InterwarehouseFormValues
}) {
  const router = useRouter()
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    saveInterwarehouse,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [sourceId, setSourceId] = useState<string | null>(request?.sourceLocationId ?? null)
  const [destinationId, setDestinationId] = useState<string | null>(
    request?.destinationLocationId ?? null,
  )
  const nextKey = useRef(request?.lines.length || 1)
  const [lines, setLines] = useState<Line[]>(() =>
    request?.lines.length
      ? request.lines.map((line, index) => ({
          key: `line-${index}`,
          product: line.product,
          inputQty: toDecimalInput(line.inputQty),
          uomId: line.uomId,
        }))
      : [{ key: "line-0", product: null, inputQty: "", uomId: "" }],
  )

  useEffect(() => {
    if (state?.ok && !request) router.push(`/inventory/antar-gudang/${state.data.id}`)
  }, [state, request, router])

  const item = (location: LocationOption) => ({
    value: location.id,
    label: `${location.path} · ${location.warehouseName}`,
  })
  const sourceWarehouse = locations.find((location) => location.id === sourceId)?.warehouseId
  const sourceItems = locations.map(item)
  // Tujuan hanya lokasi di gudang lain (satu gudang = Pindah lokasi).
  const destinationItems = locations
    .filter((location) => sourceWarehouse && location.warehouseId !== sourceWarehouse)
    .map(item)
  const payload: TransferLineDraft[] = lines.map((line) => ({
    productId: line.product?.id ?? "",
    inputQty: line.inputQty,
    uomId: line.uomId,
    lotName: "",
  }))

  function update(key: string, change: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)))
  }

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending} className={TOUCH}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        {state?.ok && request && (
          <p role="status" className="text-control text-success">
            Perubahan disimpan.
          </p>
        )}
      </FormActions>
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      {request && <input type="hidden" name="id" value={request.id} />}
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />

      <FormSection title="Data permintaan">
        <FormColumns>
          <FormColumn>
            <FormField
              label="Lokasi asal"
              htmlFor={fieldId("source")}
              errors={fieldErrors?.sourceLocationId}
            >
              <Select
                name="sourceLocationId"
                items={sourceItems}
                value={sourceId}
                onValueChange={(value) => {
                  setSourceId(value)
                  setDestinationId(null)
                }}
              >
                <SelectTrigger id={fieldId("source")} className="w-full">
                  <SelectValue placeholder="Pilih lokasi gudang asal" />
                </SelectTrigger>
                <SelectContent>
                  {sourceItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Lokasi tujuan"
              htmlFor={fieldId("destination")}
              errors={fieldErrors?.destinationLocationId}
            >
              <Select
                name="destinationLocationId"
                items={destinationItems}
                value={destinationId}
                onValueChange={setDestinationId}
              >
                <SelectTrigger id={fieldId("destination")} className="w-full">
                  <SelectValue
                    placeholder={
                      sourceId ? "Pilih lokasi di gudang lain" : "Pilih lokasi asal dulu"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {destinationItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormColumn>
          <FormColumn>
            <FormField
              label="Tanggal rencana"
              htmlFor={fieldId("date")}
              errors={fieldErrors?.scheduledDate}
            >
              <Input
                id={fieldId("date")}
                name="scheduledDate"
                type="date"
                defaultValue={fieldValue(state, "scheduledDate", request?.scheduledDate)}
              />
            </FormField>
            <FormField
              label="Referensi"
              htmlFor={fieldId("reference")}
              errors={fieldErrors?.reference}
            >
              <Input
                id={fieldId("reference")}
                name="reference"
                defaultValue={fieldValue(state, "reference", request?.reference)}
              />
            </FormField>
          </FormColumn>
        </FormColumns>
        <FormField label="Catatan" htmlFor={fieldId("notes")} errors={fieldErrors?.notes} span={12}>
          <Textarea
            id={fieldId("notes")}
            name="notes"
            rows={2}
            defaultValue={fieldValue(state, "notes", request?.notes)}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Barang"
        description="Lot dipilih otomatis saat konfirmasi (lot terlama dulu)."
      >
        <RelationalTable<Line>
          id="interwarehouse-lines"
          label="Barang"
          rows={lines}
          rowKey={(line) => line.key}
          initialEdit
          minRows={1}
          errors={fieldErrors?.lines}
          canRemove={() => lines.length > 1}
          onRemove={(keys) =>
            setLines((current) => current.filter((line) => !keys.includes(line.key)))
          }
          onAdd={() => {
            const key = `line-${nextKey.current++}`
            setLines((current) => [...current, { key, product: null, inputQty: "", uomId: "" }])
            return key
          }}
          columns={
            [
              {
                id: "product",
                label: "Produk",
                required: true,
                width: 340,
                value: (line) => (line.product ? `[${line.product.sku}] ${line.product.name}` : ""),
                edit: (line, index) => (
                  <div>
                    <SearchSelect<ProductChoice>
                      id={fieldId(`product-${line.key}`)}
                      endpoint="/api/products"
                      value={line.product}
                      required
                      onValueChange={(product) =>
                        update(line.key, { product, uomId: product?.uomId ?? "" })
                      }
                      getKey={(item) => item.id}
                      getLabel={(item) => `[${item.sku}] ${item.name}`}
                      placeholder="Cari product code atau nama produk"
                    />
                    <label htmlFor={fieldId(`product-${line.key}`)} className="sr-only">
                      Produk baris {index + 1}
                    </label>
                  </div>
                ),
                error: (line) =>
                  state?.ok === false && !line.product ? "Pilih produk." : undefined,
              },
              {
                id: "qty",
                label: "Qty",
                required: true,
                numeric: true,
                width: 160,
                value: (line) => line.inputQty,
                edit: (line, index) => (
                  <Input
                    required
                    aria-label={`Qty baris ${index + 1}`}
                    inputMode="decimal"
                    placeholder="Qty"
                    value={line.inputQty}
                    onChange={(event) => update(line.key, { inputQty: event.target.value })}
                    className={`text-right tabular-nums ${TOUCH}`}
                  />
                ),
                error: (line) =>
                  state?.ok === false && !(Number(line.inputQty.replace(",", ".")) > 0)
                    ? "Qty harus lebih dari nol."
                    : undefined,
                footer: (items) =>
                  [...Map.groupBy(items, (line) => line.uomId)].map(([id, group]) => (
                    <div key={id}>
                      {formatDecimal(sumDecimals(group.map((line) => line.inputQty)))}{" "}
                      {uoms.find((uom) => uom.id === id)?.code ?? ""}
                    </div>
                  )),
              },
              {
                id: "uom",
                label: "Satuan",
                required: true,
                width: 170,
                value: (line) => uoms.find((uom) => uom.id === line.uomId)?.code ?? "",
                edit: (line, index) => {
                  const items = uoms
                    .filter(
                      (uom) =>
                        uom.categoryId === line.product?.uomCategoryId &&
                        (!uom.productId || uom.productId === line.product.id),
                    )
                    .map((uom) => ({ value: uom.id, label: uom.code }))
                  return (
                    <Select
                      required
                      items={items}
                      value={line.uomId || null}
                      onValueChange={(value) => update(line.key, { uomId: value ?? "" })}
                      disabled={!line.product}
                    >
                      <SelectTrigger
                        aria-label={`Satuan baris ${index + 1}`}
                        className={`w-full ${TOUCH}`}
                      >
                        <SelectValue placeholder="Satuan" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                },
              },
            ] satisfies RelationColumn<Line>[]
          }
        />
      </FormSection>
    </form>
  )
}
