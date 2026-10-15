"use client"

import { useId, useState, useTransition } from "react"

import { saveReturnRequest } from "@/app/(app)/inventory/retur/actions"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
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
} from "@/lib/inventory"

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

  function update(id: string, change: Partial<{ qty: string; action: ReturnLineAction }>) {
    setLines((current) => ({ ...current, [id]: { ...current[id], ...change } }))
  }

  return (
    <form
      className="max-w-5xl space-y-6"
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
      <FormErrors errors={result?.ok === false ? result.errors : undefined} />

      <FormSection title="Data retur">
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
        <FormField label="Alasan retur" htmlFor={fieldId("reason")} errors={fieldErrors?.reason}>
          <Textarea
            id={fieldId("reason")}
            name="reason"
            rows={2}
            defaultValue={request.reason ?? ""}
          />
        </FormField>
        <FormField label="Catatan" htmlFor={fieldId("notes")} errors={fieldErrors?.notes}>
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
        <div className="divide-y rounded-lg border">
          {request.lines.map((line) => (
            <div
              key={line.id}
              className="grid gap-x-4 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_14rem] sm:items-center"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm text-foreground">{line.sku}</p>
                <p className="text-sm text-muted-foreground">
                  {line.name}
                  {line.lot && <span className="font-mono"> · lot {line.lot}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Qty retur ${line.sku}${line.lot ? ` lot ${line.lot}` : ""}`}
                  inputMode="decimal"
                  value={lines[line.id]?.qty ?? ""}
                  onChange={(event) => update(line.id, { qty: event.target.value })}
                  className={`w-28 text-right tabular-nums ${TOUCH}`}
                />
                <span className="text-sm whitespace-nowrap text-muted-foreground">
                  {line.uom} · maks. {formatDecimal(line.max)}
                </span>
              </div>
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
            </div>
          ))}
        </div>
      </FormSection>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className={TOUCH}>
          {pending ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
        {result?.ok && (
          <p role="status" className="text-sm text-success">
            {result.message}
          </p>
        )}
      </div>
    </form>
  )
}
