"use client"

import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fieldValue, type FormState } from "@/lib/action-result"
import { LOCATION_TYPE_LABELS, WAREHOUSE_LOCATION_TYPES } from "@/lib/inventory"

import { createLocation, updateLocation } from "./actions"

const TYPE_ITEMS = WAREHOUSE_LOCATION_TYPES.map((type) => ({
  value: type,
  label: LOCATION_TYPE_LABELS[type],
}))

// Nilai khusus untuk "tanpa induk", karena Select tidak bisa memilih nilai kosong.
const NO_PARENT = ""

export type ParentOption = { id: string; path: string }

function ParentSelect({
  options,
  defaultValue,
}: {
  options: ParentOption[]
  defaultValue?: string | null
}) {
  const items = [
    { value: NO_PARENT, label: "Tanpa induk (langsung di bawah gudang)" },
    ...options.map((option) => ({ value: option.id, label: option.path })),
  ]
  return (
    <Select name="parentId" items={items} defaultValue={defaultValue ?? NO_PARENT}>
      <SelectTrigger id="location-parentId" className="w-full">
        <SelectValue />
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
}

export function LocationCreateForm({
  warehouseId,
  parents,
}: {
  warehouseId: string
  parents: ParentOption[]
}) {
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    createLocation,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <p className="font-medium">Tambah lokasi</p>
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr_12rem]">
        <FormField label="Kode lokasi" htmlFor="location-code" errors={fieldErrors?.code}>
          <Input
            id="location-code"
            name="code"
            defaultValue={fieldValue(state, "code")}
            maxLength={30}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nama lokasi" htmlFor="location-name" errors={fieldErrors?.name}>
          <Input
            id="location-name"
            name="name"
            defaultValue={fieldValue(state, "name")}
            maxLength={200}
          />
        </FormField>
        <FormField label="Tipe" htmlFor="location-type" errors={fieldErrors?.type}>
          <Select name="type" items={TYPE_ITEMS} defaultValue="internal">
            <SelectTrigger id="location-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField label="Lokasi induk" htmlFor="location-parentId" errors={fieldErrors?.parentId}>
        <ParentSelect options={parents} defaultValue={fieldValue(state, "parentId")} />
      </FormField>
      {state?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah lokasi"}
      </Button>
    </form>
  )
}

export function LocationEditForm({
  location,
  parents,
}: {
  location: { id: string; name: string; parentId: string | null; active: boolean }
  parents: ParentOption[]
}) {
  const [state, formAction, pending] = useActionState<FormState<void>, FormData>(
    updateLocation,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="id" value={location.id} />
      <FormField label="Nama lokasi" htmlFor="location-name" errors={fieldErrors?.name}>
        <Input
          id="location-name"
          name="name"
          defaultValue={fieldValue(state, "name", location.name)}
          maxLength={200}
        />
      </FormField>
      <FormField label="Lokasi induk" htmlFor="location-parentId" errors={fieldErrors?.parentId}>
        <ParentSelect options={parents} defaultValue={location.parentId} />
      </FormField>
      <CheckboxField
        name="active"
        label="Aktif"
        description="Lokasi yang diarsipkan tidak bisa dipilih untuk transaksi baru."
        defaultChecked={state?.ok === false ? state.values?.active === "on" : location.active}
      />
      {state?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  )
}
