"use client"

import { useActionState } from "react"

import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
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
import { fieldValue, type FormState } from "@/lib/action-result"
import { LOCATION_TYPE_LABELS, WAREHOUSE_LOCATION_TYPES } from "@/lib/inventory"

import { createLocation, updateLocation } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

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
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Tambah lokasi"}
        </Button>
        {state?.ok && (
          <p role="status" className="text-control text-muted-foreground">
            {state.message}
          </p>
        )}
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <FormSection title="Tambah lokasi">
        <FormField label="Kode lokasi" htmlFor="location-code" errors={fieldErrors?.code} span={3}>
          <Input
            id="location-code"
            name="code"
            defaultValue={fieldValue(state, "code")}
            maxLength={30}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nama lokasi" htmlFor="location-name" errors={fieldErrors?.name} span={6}>
          <Input
            id="location-name"
            name="name"
            defaultValue={fieldValue(state, "name")}
            maxLength={200}
          />
        </FormField>
        <FormField label="Tipe" htmlFor="location-type" errors={fieldErrors?.type} span={3}>
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
        <FormField
          label="Lokasi induk"
          htmlFor="location-parentId"
          errors={fieldErrors?.parentId}
          span={12}
        >
          <ParentSelect options={parents} defaultValue={fieldValue(state, "parentId")} />
        </FormField>
      </FormSection>
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
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="id" value={location.id} />
      <FormSection title="Data lokasi">
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
      </FormSection>
    </form>
  )
}
