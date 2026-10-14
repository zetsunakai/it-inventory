"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { FormErrors } from "@/components/form-errors"
import { FormField } from "@/components/form-field"
import { ProductCategorySelect } from "@/components/product-category-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fieldValue, type FormState } from "@/lib/action-result"
import { CODE_PREFIX_PATTERN, DEFAULT_CODE_DIGITS, skuExample } from "@/lib/product-category"
import type { ProductCategoryOption, ProductCategoryRow } from "@/server/queries/product-categories"

import { createProductCategory, updateProductCategory } from "./actions"

// Form tambah (tanpa category) dan ubah kategori produk.
export function ProductCategoryForm({
  category,
  parents,
}: {
  category?: ProductCategoryRow
  parents: ProductCategoryOption[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    category ? updateProductCategory : createProductCategory,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [parentId, setParentId] = useState(category?.parentId ?? "")
  const [prefix, setPrefix] = useState(category?.codePrefix ?? "")
  const [digits, setDigits] = useState(String(category?.codeDigits ?? DEFAULT_CODE_DIGITS))

  // Kategori baru: kembali ke daftar.
  useEffect(() => {
    if (!category && state?.ok) router.push("/master/kategori-produk")
  }, [category, state, router])

  const cleanPrefix = prefix.trim().toUpperCase()
  const digitCount = Number(digits)
  const example =
    CODE_PREFIX_PATTERN.test(cleanPrefix) && digitCount >= 3 && digitCount <= 10
      ? skuExample(cleanPrefix, digitCount)
      : null

  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {category && <input type="hidden" name="id" value={category.id} />}
      <FormField label="Nama kategori" htmlFor="name" errors={fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={fieldValue(state, "name", category?.name)}
          maxLength={100}
        />
      </FormField>
      <FormField label="Kategori induk" htmlFor="parentId" errors={fieldErrors?.parentId}>
        <ProductCategorySelect
          id="parentId"
          name="parentId"
          options={parents}
          value={parentId}
          onValueChange={setParentId}
          emptyLabel="Tanpa induk (kategori teratas)"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <FormField
          label="Prefix kode"
          htmlFor="codePrefix"
          errors={fieldErrors?.codePrefix}
          hint={
            example
              ? `SKU produk baru yang dikosongkan dibuat otomatis, mis. ${example}.`
              : "Kosongkan bila SKU produk di kategori ini selalu diisi manual."
          }
        >
          <Input
            id="codePrefix"
            name="codePrefix"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            maxLength={10}
            autoComplete="off"
            className="font-mono uppercase"
          />
        </FormField>
        <FormField label="Jumlah digit" htmlFor="codeDigits" errors={fieldErrors?.codeDigits}>
          <Input
            id="codeDigits"
            name="codeDigits"
            value={digits}
            onChange={(event) => setDigits(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </FormField>
      </div>
      {category && (
        <CheckboxField
          name="active"
          label="Aktif"
          description="Kategori yang diarsipkan tidak bisa dipilih untuk produk baru atau sebagai induk."
          defaultChecked={state?.ok === false ? state.values?.active === "on" : category.active}
        />
      )}
      {state?.ok && category && (
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
