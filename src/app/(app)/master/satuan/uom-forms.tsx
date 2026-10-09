"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { FormErrors } from "@/components/form-errors"
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
import { toDecimalInput } from "@/lib/decimal"

import { createUom, createUomCategory, updateUom } from "./actions"

export type CategoryOption = { id: string; name: string; referenceCode: string | null }

export function UomCreateForm({ categories }: { categories: CategoryOption[] }) {
  const router = useRouter()
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    createUom,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const reference = categories.find((category) => category.id === categoryId)?.referenceCode
  const items = categories.map((category) => ({ value: category.id, label: category.name }))

  useEffect(() => {
    if (state?.ok)
      router.push(`/master/satuan?${new URLSearchParams({ kategori: categoryId ?? "" })}`)
  }, [state, router, categoryId])

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <FormField label="Kategori" htmlFor="categoryId" errors={fieldErrors?.categoryId}>
        <Select name="categoryId" items={items} value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger id="categoryId" className="w-full">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <FormField label="Kode satuan" htmlFor="code" errors={fieldErrors?.code}>
          <Input
            id="code"
            name="code"
            defaultValue={fieldValue(state, "code")}
            onChange={(event) => setCode(event.target.value.trim())}
            maxLength={20}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nama satuan" htmlFor="name" errors={fieldErrors?.name}>
          <Input id="name" name="name" defaultValue={fieldValue(state, "name")} maxLength={100} />
        </FormField>
      </div>
      <FactorField
        errors={fieldErrors?.factor}
        defaultValue={fieldValue(state, "factor")}
        hint={
          reference
            ? `1 ${code || "satuan ini"} = berapa ${reference}? Contoh: 1 TON = 1000 KG, 1 G = 0,001 KG.`
            : "Pilih kategori dulu untuk melihat satuan acuannya."
        }
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  )
}

export function UomEditForm({
  uom,
}: {
  uom: {
    id: string
    code: string
    name: string
    factor: string
    isReference: boolean
    active: boolean
    referenceCode: string | null
  }
}) {
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    updateUom,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="id" value={uom.id} />
      {/* Satuan acuan selalu berfaktor 1, jadi faktornya dikirim tetap. */}
      {uom.isReference && <input type="hidden" name="factor" value="1" />}
      <FormField label="Nama satuan" htmlFor="name" errors={fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={fieldValue(state, "name", uom.name)}
          maxLength={100}
        />
      </FormField>
      {uom.isReference ? (
        <p className="text-sm text-muted-foreground">
          {uom.code} adalah satuan acuan kategorinya, faktornya selalu 1.
        </p>
      ) : (
        <FactorField
          errors={fieldErrors?.factor}
          defaultValue={fieldValue(state, "factor", toDecimalInput(uom.factor))}
          hint={`1 ${uom.code} = berapa ${uom.referenceCode}? Mengubah faktor hanya berlaku untuk input berikutnya.`}
        />
      )}
      <CheckboxField
        name="active"
        label="Aktif"
        description="Satuan yang diarsipkan tidak bisa dipilih untuk produk dan transaksi baru."
        defaultChecked={state?.ok === false ? state.values?.active === "on" : uom.active}
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

function FactorField({
  errors,
  defaultValue,
  hint,
}: {
  errors?: string[]
  defaultValue?: string
  hint: string
}) {
  return (
    <FormField label="Faktor konversi" htmlFor="factor" errors={errors} hint={hint}>
      <Input
        id="factor"
        name="factor"
        defaultValue={defaultValue}
        inputMode="decimal"
        autoComplete="off"
        className="sm:w-48"
      />
    </FormField>
  )
}

export function UomCategoryForm() {
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    createUomCategory,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined

  return (
    <form action={formAction} className="space-y-4 rounded-lg border p-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <p className="font-medium">Tambah kategori</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Kode kategori" htmlFor="category-code" errors={fieldErrors?.code}>
          <Input
            id="category-code"
            name="code"
            defaultValue={fieldValue(state, "code")}
            maxLength={30}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Nama kategori" htmlFor="category-name" errors={fieldErrors?.name}>
          <Input
            id="category-name"
            name="name"
            defaultValue={fieldValue(state, "name")}
            maxLength={100}
          />
        </FormField>
        <FormField
          label="Kode satuan acuan"
          htmlFor="category-reference-code"
          errors={fieldErrors?.referenceCode}
          hint="Satuan dasar kategori ini, faktornya 1."
        >
          <Input
            id="category-reference-code"
            name="referenceCode"
            defaultValue={fieldValue(state, "referenceCode")}
            maxLength={20}
            autoComplete="off"
          />
        </FormField>
        <FormField
          label="Nama satuan acuan"
          htmlFor="category-reference-name"
          errors={fieldErrors?.referenceName}
        >
          <Input
            id="category-reference-name"
            name="referenceName"
            defaultValue={fieldValue(state, "referenceName")}
            maxLength={100}
          />
        </FormField>
      </div>
      {state?.ok && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Tambah kategori"}
      </Button>
    </form>
  )
}
