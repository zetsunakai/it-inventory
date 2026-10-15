"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField, FormSection } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
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
import {
  REF_CODE_PARENT_TYPES,
  REF_CODE_TYPE_LABELS,
  REF_CODE_TYPES,
  type RefCodeType,
} from "@/lib/ref-codes"

import { createRefCode, updateRefCode } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

const TYPE_ITEMS = REF_CODE_TYPES.map((type) => ({
  value: type,
  label: REF_CODE_TYPE_LABELS[type],
}))

export function RefCodeCreateForm() {
  const router = useRouter()
  const [type, setType] = useState<RefCodeType | null>(null)
  const [state, formAction, pending] = useActionState<
    FormState<{ id: string; type: RefCodeType; code: string }>,
    FormData
  >(createRefCode, null)
  const parentType = type ? REF_CODE_PARENT_TYPES[type] : undefined
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  // Setelah tersimpan, kembali ke daftar dan tampilkan referensi yang baru dibuat.
  useEffect(() => {
    if (!state?.ok) return
    const { type, code } = state.data
    router.push(`/master/referensi?${new URLSearchParams({ jenis: type, q: code })}`)
  }, [state, router])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/master/referensi")}>
          Batal
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <FormSection title="Data referensi">
        <FormField label="Jenis" htmlFor="type" errors={fieldErrors?.type}>
          <Select
            name="type"
            items={TYPE_ITEMS}
            value={type}
            onValueChange={(value) => setType(value as RefCodeType | null)}
          >
            <SelectTrigger id="type" className="w-full">
              <SelectValue placeholder="Pilih jenis referensi" />
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
        {parentType && (
          <FormField
            label={REF_CODE_TYPE_LABELS[parentType]}
            htmlFor="parentCode"
            errors={fieldErrors?.parentCode}
          >
            {/* key: pilihan induk dikosongkan saat jenis berganti. */}
            <RefCodeSelect key={parentType} id="parentCode" type={parentType} name="parentCode" />
          </FormField>
        )}
        <FormField label="Kode" htmlFor="code" errors={fieldErrors?.code} span={4}>
          <Input
            id="code"
            name="code"
            defaultValue={fieldValue(state, "code")}
            maxLength={50}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nama" htmlFor="name" errors={fieldErrors?.name} span={8}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name")}
            maxLength={200}
            autoComplete="off"
          />
        </FormField>
      </FormSection>
    </form>
  )
}

export function RefCodeEditForm({
  id,
  name,
  active,
}: {
  id: string
  name: string
  active: boolean
}) {
  const [state, formAction, pending] = useActionState<FormState<void>, FormData>(
    updateRefCode,
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
      <input type="hidden" name="id" value={id} />
      <FormSection title="Data referensi">
        <FormField label="Nama" htmlFor="name" errors={fieldErrors?.name} span={12}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", name)}
            maxLength={200}
            autoComplete="off"
          />
        </FormField>
        <CheckboxField
          name="active"
          label="Aktif"
          description="Referensi yang diarsipkan tidak bisa dipilih untuk data baru, tapi tetap tampil di data lama."
          defaultChecked={state?.ok === false ? state.values?.active === "on" : active}
        />
      </FormSection>
    </form>
  )
}
