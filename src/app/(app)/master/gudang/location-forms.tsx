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

import { updateLocation } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

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
