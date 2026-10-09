"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
    <form action={formAction} className="max-w-xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
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
      <FormField label="Kode" htmlFor="code" errors={fieldErrors?.code}>
        <Input
          id="code"
          name="code"
          defaultValue={fieldValue(state, "code")}
          maxLength={50}
          autoComplete="off"
        />
      </FormField>
      <FormField label="Nama" htmlFor="name" errors={fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={fieldValue(state, "name")}
          maxLength={200}
          autoComplete="off"
        />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/master/referensi")}>
          Batal
        </Button>
      </div>
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

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="id" value={id} />
      <FormField label="Nama" htmlFor="name" errors={fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={fieldValue(state, "name", name)}
          maxLength={200}
          autoComplete="off"
        />
      </FormField>
      <div className="flex items-start gap-2">
        <Checkbox
          id="active"
          name="active"
          defaultChecked={state?.ok === false ? state.values?.active === "on" : active}
        />
        <div className="grid gap-1 leading-none">
          <Label htmlFor="active">Aktif</Label>
          <p className="text-sm text-muted-foreground">
            Referensi yang diarsipkan tidak bisa dipilih untuk data baru, tapi tetap tampil di data
            lama.
          </p>
        </div>
      </div>
      {state?.ok && state.message && (
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
