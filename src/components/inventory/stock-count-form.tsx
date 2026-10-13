"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { createStockCount } from "@/app/(app)/inventory/opname/actions"
import { FormErrors } from "@/components/form-errors"
import { FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/action-result"
import type { LocationOption } from "@/server/queries/transfers"

const WHOLE_WAREHOUSE = ""

// Sesi opname baru: satu gudang, atau satu lokasi beserta sub-lokasinya. Cut-off = sekarang.
export function StockCountForm({ locations }: { locations: LocationOption[] }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    createStockCount,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const warehouses = [
    ...new Map(
      locations.map((location) => [
        location.warehouseId,
        {
          value: location.warehouseId,
          label: `${location.warehouseCode} · ${location.warehouseName}`,
        },
      ]),
    ).values(),
  ]
  const [warehouseId, setWarehouseId] = useState<string | null>(warehouses[0]?.value ?? null)
  const [locationId, setLocationId] = useState<string | null>(WHOLE_WAREHOUSE)
  const locationItems = [
    { value: WHOLE_WAREHOUSE, label: "Seluruh gudang" },
    ...locations
      .filter((location) => location.warehouseId === warehouseId)
      .map((location) => ({ value: location.id, label: `${location.path} dan sub-lokasinya` })),
  ]

  useEffect(() => {
    if (state?.ok) router.push(`/inventory/opname/${state.data.id}`)
  }, [state, router])

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      <FormField label="Gudang" htmlFor="count-warehouse" errors={fieldErrors?.warehouseId}>
        <Select
          name="warehouseId"
          items={warehouses}
          value={warehouseId}
          onValueChange={(value) => {
            setWarehouseId(value)
            setLocationId(WHOLE_WAREHOUSE)
          }}
        >
          <SelectTrigger id="count-warehouse" className="w-full">
            <SelectValue placeholder="Pilih gudang" />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Lingkup" htmlFor="count-location" errors={fieldErrors?.locationId}>
        <Select
          name="locationId"
          items={locationItems}
          value={locationId}
          onValueChange={setLocationId}
        >
          <SelectTrigger id="count-location" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locationItems.map((item) => (
              <SelectItem key={item.value || "semua"} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Catatan" htmlFor="count-notes" errors={fieldErrors?.notes}>
        <Textarea id="count-notes" name="notes" rows={2} />
      </FormField>
      <Button type="submit" disabled={pending || !warehouseId}>
        {pending ? "Membuat sesi…" : "Buat sesi opname"}
      </Button>
    </form>
  )
}
