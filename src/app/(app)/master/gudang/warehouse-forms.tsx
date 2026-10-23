"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField, FormSection, StaticField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { WarehouseLocationDraft } from "@/modules/inventory/lib/warehouse-locations"
import { Section } from "@/components/layout/section"
import { WarehouseLocationTable } from "./warehouse-location-table"
import { fieldValue, type FormState } from "@/lib/action-result"

import { createWarehouse, updateWarehouse } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

type Warehouse = {
  id: string
  code: string
  name: string
  address: string
  stockLocationId: string | null
  active: boolean
}

// Form tambah (tanpa warehouse) dan ubah gudang. Lokasi stok utama dipilih dari lokasi internal
// aktif gudang itu (I-07), jadi hanya ada saat mengubah gudang.
export function WarehouseForm({
  warehouse,
  initialLocations = [],
}: {
  warehouse?: Warehouse
  initialLocations?: WarehouseLocationDraft[]
}) {
  const [stockLocationId, setStockLocationId] = useState<string | null>(
    warehouse?.stockLocationId ?? "",
  )
  const [locationRows, setLocationRows] = useState(initialLocations)
  const [deletedIds, setDeletedIds] = useState<string[]>([])
  const stockItems = [
    { value: "", label: "Belum dipilih" },
    ...locationRows
      .filter((row) => row.type === "internal" && (row.active || row.id === stockLocationId))
      .map((row) => ({ value: row.id, label: `${row.code} · ${row.name}` })),
  ]
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    warehouse ? updateWarehouse : createWarehouse,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  // Gudang baru: lanjut ke halaman detail untuk menambah lokasi.
  useEffect(() => {
    if (!warehouse && state?.ok) router.push(`/master/gudang/${state.data.id}`)
  }, [warehouse, state, router])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {warehouse && <input type="hidden" name="id" value={warehouse.id} />}
      <input
        type="hidden"
        name="locationRows"
        value={JSON.stringify({ rows: locationRows, deletedIds })}
      />
      <FormSection title="Data gudang">
        {warehouse ? (
          <StaticField
            span={6}
            label="Kode gudang"
            value={warehouse.code}
            mono
            reason="Tidak bisa diubah."
          />
        ) : (
          <FormField label="Kode gudang" htmlFor="code" errors={fieldErrors?.code} span={6}>
            <Input
              id="code"
              name="code"
              defaultValue={fieldValue(state, "code")}
              maxLength={30}
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Nama gudang" htmlFor="name" errors={fieldErrors?.name} span={6}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", warehouse?.name)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address} span={6}>
          <Textarea
            rows={2}
            id="address"
            name="address"
            defaultValue={fieldValue(state, "address", warehouse?.address)}
            maxLength={500}
          />
        </FormField>
        {warehouse && (
          <FormField
            label="Lokasi stok utama"
            htmlFor="stock-location"
            errors={fieldErrors?.stockLocationId}
            hint="Lokasi bawaan gudang, mis. untuk produk tanpa stok di stock opname."
          >
            <Select
              name="stockLocationId"
              items={stockItems}
              value={stockLocationId}
              onValueChange={setStockLocationId}
            >
              <SelectTrigger id="stock-location" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stockItems.map((item) => (
                  <SelectItem key={item.value || "kosong"} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        {warehouse && (
          <CheckboxField
            name="active"
            label="Aktif"
            description="Gudang yang diarsipkan tidak bisa dipilih untuk transaksi baru."
            defaultChecked={checked("active", warehouse.active)}
          />
        )}
      </FormSection>
      <Section
        title="Lokasi"
        description="Tambah dan ubah baris di tabel. Perubahan disimpan bersama data gudang."
      >
        <fieldset disabled={pending} className="min-w-0">
          <WarehouseLocationTable
            rows={locationRows}
            onChange={setLocationRows}
            canAdd={!warehouse || warehouse.active}
            errors={fieldErrors?.locationRows}
            onRemove={(ids) => {
              setDeletedIds((current) => [
                ...new Set([
                  ...current,
                  ...locationRows
                    .filter((row) => ids.includes(row.id) && !row.isNew)
                    .map((row) => row.id),
                ]),
              ])
              setLocationRows((current) => current.filter((row) => !ids.includes(row.id)))
              if (stockLocationId && ids.includes(stockLocationId)) setStockLocationId("")
            }}
          />
        </fieldset>
        {warehouse && !warehouse.active && (
          <p className="text-control text-muted-foreground">
            Aktifkan gudang dan simpan sebelum menambahkan lokasi.
          </p>
        )}
      </Section>
    </form>
  )
}
