"use client"

import { lineTableColumns, RETURN_LINE_FIELDS } from "./line-table-columns"

import { useId, useState, useTransition } from "react"

import { saveReturnRequest } from "@/modules/inventory/actions/returns"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { RelationalTable } from "@/components/relational/relational-table"
import { sumDecimals } from "@/components/relational/relational-utils"
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
import type { ActionResult } from "@/lib/action-result"
import { formatDecimal, toDecimalInput } from "@/lib/decimal"
import {
  RETURN_LINE_ACTION_LABELS,
  RETURN_LINE_ACTIONS,
  type ReturnLineAction,
} from "@/modules/inventory/lib/inventory"
import { useSaveFeedback } from "@/components/layout/record-modes"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

export type ReturnRequestFormValues = {
  id: string
  locationId: string
  scheduledDate: string | null
  reason: string | null
  notes: string | null
  lines: {
    id: string
    sku: string
    name: string
    lot: string | null
    qty: string
    uom: string
    action: ReturnLineAction
    // Sisa yang masih bisa diretur dari transfer asal (satuan stok).
    max: string
  }[]
}

const TOUCH = "pointer-coarse:h-11"
const ACTION_ITEMS = RETURN_LINE_ACTIONS.map((value) => ({
  value,
  label: RETURN_LINE_ACTION_LABELS[value],
}))

// Form permintaan retur Draft (backlog R-11): produk dan lot mengikuti transfer asal; yang diubah
// lokasi gudang, tanggal, alasan, qty per baris (0 = tidak diretur), dan tindakannya. Batas qty
// dicek lagi di database saat simpan dan Konfirmasi.
export function ReturnRequestForm({
  request,
  locations,
  locationLabel,
}: {
  request: ReturnRequestFormValues
  locations: { value: string; label: string }[]
  // "Lokasi asal" (retur ke vendor) atau "Lokasi tujuan" (retur dari customer).
  locationLabel: string
}) {
  const uid = useId()
  const fieldId = (name: string) => `${uid}-${name}`
  const [locationId, setLocationId] = useState<string | null>(request.locationId)
  const [lines, setLines] = useState(() =>
    Object.fromEntries(
      request.lines.map((line) => [
        line.id,
        { qty: toDecimalInput(line.qty), action: line.action as ReturnLineAction },
      ]),
    ),
  )
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const fieldErrors = result?.ok === false ? result.fieldErrors : undefined
  // Tersimpan → kembali ke mode baca (RecordModes) dengan pesannya.
  useSaveFeedback(result)

  function update(id: string, change: Partial<{ qty: string; action: ReturnLineAction }>) {
    setLines((current) => ({ ...current, [id]: { ...current[id], ...change } }))
  }

  return (
    <form
      className={FORM_CLASS}
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        startTransition(async () =>
          setResult(
            await saveReturnRequest({
              id: request.id,
              locationId: locationId ?? "",
              scheduledDate: String(data.get("scheduledDate") ?? ""),
              reason: String(data.get("reason") ?? ""),
              notes: String(data.get("notes") ?? ""),
              lines,
            }),
          ),
        )
      }}
    >
      <FormActions>
        <Button type="submit" disabled={pending} className={TOUCH}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      <FormErrors errors={result?.ok === false ? result.errors : undefined} />

      <FormSection title="Data retur">
        <FormField
          label={locationLabel}
          htmlFor={fieldId("location")}
          errors={fieldErrors?.locationId}
        >
          <Select items={locations} value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id={fieldId("location")} className="w-full">
              <SelectValue placeholder="Pilih lokasi gudang" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="Tanggal rencana"
          htmlFor={fieldId("date")}
          errors={fieldErrors?.scheduledDate}
        >
          <Input
            id={fieldId("date")}
            name="scheduledDate"
            type="date"
            defaultValue={request.scheduledDate ?? ""}
          />
        </FormField>
        <FormField
          label="Alasan retur"
          htmlFor={fieldId("reason")}
          errors={fieldErrors?.reason}
          span={12}
        >
          <Textarea
            id={fieldId("reason")}
            name="reason"
            rows={2}
            defaultValue={request.reason ?? ""}
          />
        </FormField>
        <FormField label="Catatan" htmlFor={fieldId("notes")} errors={fieldErrors?.notes} span={12}>
          <Textarea
            id={fieldId("notes")}
            name="notes"
            rows={2}
            defaultValue={request.notes ?? ""}
          />
        </FormField>
      </FormSection>

      <FormSection
        title="Barang yang diretur"
        description="Isi 0 untuk barang yang tidak diretur. Qty dalam satuan stok produk. Barang dengan pengganti dibuatkan transfer pengganti setelah retur Selesai."
      >
        <RelationalTable
          id="return-lines"
          label="Barang yang diretur"
          rows={request.lines}
          rowKey={(line) => line.id}
          initialEdit
          columns={lineTableColumns<(typeof request.lines)[number]>(RETURN_LINE_FIELDS, [
            {
              id: "product",
              label: "Produk",
              width: 340,
              value: (line) => `[${line.sku}] ${line.name}${line.lot ? ` · lot ${line.lot}` : ""}`,
            },
            {
              id: "qty",
              label: "Qty retur",
              numeric: true,
              width: 180,
              value: (line) => lines[line.id]?.qty ?? "",
              edit: (line) => (
                <Input
                  aria-label={`Qty retur ${line.sku}${line.lot ? ` lot ${line.lot}` : ""}`}
                  inputMode="decimal"
                  value={lines[line.id]?.qty ?? ""}
                  onChange={(event) => update(line.id, { qty: event.target.value })}
                  className={`text-right tabular-nums ${TOUCH}`}
                />
              ),
              footer: (items) =>
                [...Map.groupBy(items, (line) => line.uom)].map(([uom, group]) => (
                  <div key={uom}>
                    {formatDecimal(sumDecimals(group.map((line) => lines[line.id]?.qty ?? "")))}{" "}
                    {uom}
                  </div>
                )),
            },
            {
              id: "max",
              label: "Maksimum",
              width: 180,
              value: (line) => `${formatDecimal(line.max)} ${line.uom}`,
            },
            {
              id: "action",
              label: "Tindakan",
              width: 280,
              value: (line) => RETURN_LINE_ACTION_LABELS[lines[line.id]?.action ?? line.action],
              edit: (line) => (
                <Select
                  items={ACTION_ITEMS}
                  value={lines[line.id]?.action}
                  onValueChange={(value) => value && update(line.id, { action: value })}
                >
                  <SelectTrigger
                    aria-label={`Tindakan ${line.sku}${line.lot ? ` lot ${line.lot}` : ""}`}
                    className={`w-full ${TOUCH}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_ITEMS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ),
            },
          ])}
        />
      </FormSection>
    </form>
  )
}
