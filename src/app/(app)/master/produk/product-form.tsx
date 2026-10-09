"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection, StaticField } from "@/components/form-field"
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
import { Textarea } from "@/components/ui/textarea"
import { fieldValue, type FormState } from "@/lib/action-result"
import { toDecimalInput } from "@/lib/decimal"
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryCategory,
} from "@/lib/inventory"
import type { RefCodeOption } from "@/lib/ref-codes"
import type { UomOption } from "@/server/queries/products"

import { createProduct, updateProduct } from "./actions"

const CATEGORY_ITEMS = INVENTORY_CATEGORIES.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}))

export type ProductFormValues = {
  id: string
  sku: string
  name: string
  description: string | null
  category: InventoryCategory
  uom: { code: string; name: string }
  hs: RefCodeOption | null
  ceisaUnit: RefCodeOption | null
  ceisaFactor: string | null
  netWeight: string | null
  brand: string | null
  model: string | null
  size: string | null
  lotRequired: boolean
  active: boolean
}

// Form tambah (tanpa product) dan ubah produk.
export function ProductForm({ product, uoms }: { product?: ProductFormValues; uoms: UomOption[] }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<
    FormState<{ id: string; sku: string }>,
    FormData
  >(product ? updateProduct : createProduct, null)
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [uomId, setUomId] = useState<string | null>(null)
  const [ceisaUnit, setCeisaUnit] = useState(product?.ceisaUnit ?? null)
  const stockUom = product?.uom.code ?? uoms.find((uom) => uom.id === uomId)?.code
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  const uomItems = uoms.map((uom) => ({
    value: uom.id,
    label: `[${uom.code}] ${uom.name} · ${uom.categoryName}`,
  }))

  // Produk baru: kembali ke daftar, tersaring ke SKU yang baru dibuat.
  useEffect(() => {
    if (product || !state?.ok) return
    router.push(`/master/produk?${new URLSearchParams({ q: state.data.sku })}`)
  }, [product, state, router])

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {product && <input type="hidden" name="id" value={product.id} />}

      <FormSection title="Data produk">
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          {product ? (
            <StaticField label="SKU" value={product.sku} mono reason="Tidak bisa diubah." />
          ) : (
            <FormField label="SKU" htmlFor="sku" errors={fieldErrors?.sku}>
              <Input
                id="sku"
                name="sku"
                defaultValue={fieldValue(state, "sku")}
                maxLength={50}
                autoComplete="off"
              />
            </FormField>
          )}
          <FormField label="Nama produk" htmlFor="name" errors={fieldErrors?.name}>
            <Input
              id="name"
              name="name"
              defaultValue={fieldValue(state, "name", product?.name)}
              maxLength={200}
            />
          </FormField>
        </div>
        <FormField label="Deskripsi" htmlFor="description" errors={fieldErrors?.description}>
          <Textarea
            id="description"
            name="description"
            defaultValue={fieldValue(state, "description", product?.description)}
            maxLength={2000}
            rows={3}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Kategori IT Inventory"
            htmlFor="category"
            errors={fieldErrors?.category}
          >
            <Select name="category" items={CATEGORY_ITEMS} defaultValue={product?.category ?? null}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {product ? (
            <StaticField
              label="Satuan stok"
              value={`[${product.uom.code}] ${product.uom.name}`}
              reason="Tidak bisa diubah: qty di ledger tersimpan dalam satuan ini."
            />
          ) : (
            <FormField label="Satuan stok" htmlFor="uomId" errors={fieldErrors?.uomId}>
              <Select name="uomId" items={uomItems} value={uomId} onValueChange={setUomId}>
                <SelectTrigger id="uomId" className="w-full">
                  <SelectValue placeholder="Pilih satuan stok" />
                </SelectTrigger>
                <SelectContent>
                  {uomItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Merk" htmlFor="brand" errors={fieldErrors?.brand}>
            <Input
              id="brand"
              name="brand"
              defaultValue={fieldValue(state, "brand", product?.brand)}
            />
          </FormField>
          <FormField label="Tipe" htmlFor="model" errors={fieldErrors?.model}>
            <Input
              id="model"
              name="model"
              defaultValue={fieldValue(state, "model", product?.model)}
            />
          </FormField>
          <FormField label="Ukuran" htmlFor="size" errors={fieldErrors?.size}>
            <Input id="size" name="size" defaultValue={fieldValue(state, "size", product?.size)} />
          </FormField>
        </div>
        <FormField
          label="Berat netto (kg)"
          htmlFor="netWeight"
          errors={fieldErrors?.netWeight}
          hint={`Per 1 ${stockUom ?? "satuan stok"}.`}
        >
          <Input
            id="netWeight"
            name="netWeight"
            defaultValue={fieldValue(
              state,
              "netWeight",
              product?.netWeight ? toDecimalInput(product.netWeight) : undefined,
            )}
            inputMode="decimal"
            className="sm:w-48"
          />
        </FormField>
        <CheckboxField
          name="lotRequired"
          label="Wajib lot"
          description="Setiap penerimaan dan pengeluaran produk ini harus mencantumkan nomor lot/batch."
          defaultChecked={checked("lotRequired", product?.lotRequired ?? false)}
        />
      </FormSection>

      <FormSection
        title="Data kepabeanan"
        description="Kode HS dan satuan CEISA wajib lengkap sebelum produk bisa dipakai di dokumen BC."
      >
        <FormField label="Kode HS" htmlFor="hsCode" errors={fieldErrors?.hsCode}>
          <RefCodeSelect
            id="hsCode"
            type="hs_code"
            name="hsCode"
            defaultValue={product?.hs ?? null}
            placeholder="Cari kode HS atau uraian"
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField
            label="Satuan CEISA"
            htmlFor="ceisaUnitCode"
            errors={fieldErrors?.ceisaUnitCode}
          >
            <RefCodeSelect
              id="ceisaUnitCode"
              type="ceisa_unit"
              name="ceisaUnitCode"
              defaultValue={product?.ceisaUnit ?? null}
              onValueChange={setCeisaUnit}
              placeholder="Cari kode satuan, misalnya PCE atau KGM"
            />
          </FormField>
          <FormField
            label="Faktor satuan CEISA"
            htmlFor="ceisaFactor"
            errors={fieldErrors?.ceisaFactor}
            hint={`1 ${stockUom ?? "satuan stok"} = berapa ${ceisaUnit?.code ?? "satuan CEISA"}?`}
          >
            <Input
              id="ceisaFactor"
              name="ceisaFactor"
              defaultValue={fieldValue(
                state,
                "ceisaFactor",
                product?.ceisaFactor ? toDecimalInput(product.ceisaFactor) : undefined,
              )}
              inputMode="decimal"
            />
          </FormField>
        </div>
      </FormSection>

      {product && (
        <CheckboxField
          name="active"
          label="Aktif"
          description="Produk yang diarsipkan tidak bisa dipilih untuk transaksi baru."
          defaultChecked={checked("active", product.active)}
        />
      )}
      {state?.ok && product && (
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
