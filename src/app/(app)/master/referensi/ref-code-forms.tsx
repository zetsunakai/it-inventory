"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField, FormSection } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fieldValue, type FormState } from "@/lib/action-result"
import {
  REF_CODE_PARENT_TYPES,
  REF_CODE_TYPE_LABELS,
  refCodeListHref,
  type RefCodeType,
} from "@/lib/ref-codes"

import { createRefCode, updateRefCode } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

// Jenis mengikuti menu yang dibuka (satu menu per jenis), jadi tidak dipilih di form.
export function RefCodeCreateForm({ type }: { type: RefCodeType }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<
    FormState<{ id: string; type: RefCodeType; code: string }>,
    FormData
  >(createRefCode, null)
  const parentType = REF_CODE_PARENT_TYPES[type]
  const listHref = refCodeListHref(type)
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  // Setelah tersimpan, kembali ke daftar dan tampilkan referensi yang baru dibuat.
  useEffect(() => {
    if (!state?.ok) return
    router.push(`${listHref}?${new URLSearchParams({ q: state.data.code })}`)
  }, [state, router, listHref])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(listHref)}>
          Batal
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <FormSection title="Data referensi">
        <input type="hidden" name="type" value={type} />
        {parentType && (
          <FormField
            label={REF_CODE_TYPE_LABELS[parentType]}
            htmlFor="parentCode"
            errors={fieldErrors?.parentCode}
          >
            <RefCodeSelect id="parentCode" type={parentType} name="parentCode" />
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
