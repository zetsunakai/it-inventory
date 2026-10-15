"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection, StaticField } from "@/components/form-field"
import { ProductCategorySelect } from "@/components/product-category-select"
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
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  PRODUCT_TRACKING_LABELS,
  PRODUCT_TRACKINGS,
  type ProductTracking,
  type InventoryCategory,
} from "@/lib/inventory"
import { DEFAULT_CODE_DIGITS, skuExample } from "@/lib/product-category"
import type { RefCodeOption } from "@/lib/ref-codes"
import type { ProductCategoryOption } from "@/server/queries/product-categories"
import type { UomOption } from "@/server/queries/products"

import { createProduct, updateProduct } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

const TRACKING_ITEMS = PRODUCT_TRACKINGS.map((tracking) => ({
  value: tracking,
  label: PRODUCT_TRACKING_LABELS[tracking],
}))

const CATEGORY_ITEMS = INVENTORY_CATEGORIES.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}))

export type ProductFormValues = {
  id: string
  sku: string
  name: string
  description: string | null
  categoryId: string | null
  category: InventoryCategory
  uom: { code: string; name: string }
  hs: RefCodeOption | null
  brand: string | null
  model: string | null
  size: string | null
  tracking: ProductTracking
  lotAuto: boolean
  lotDigits: number
  // Pelacakan terkunci selama produk punya stok atau transaksi belum selesai.
  trackingLocked: boolean
  active: boolean
}

// Form tambah (tanpa product) dan ubah produk.
export function ProductForm({
  product,
  uoms,
  categories,
}: {
  product?: ProductFormValues
  uoms: UomOption[]
  categories: ProductCategoryOption[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<
    FormState<{ id: string; sku: string }>,
    FormData
  >(product ? updateProduct : createProduct, null)
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)
  const [uomId, setUomId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [tracking, setTracking] = useState<ProductTracking>(product?.tracking ?? "none")
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved
  const [lotAuto, setLotAuto] = useState(checked("lotAuto", product?.lotAuto ?? false))
  const [lotDigits, setLotDigits] = useState(String(product?.lotDigits ?? DEFAULT_CODE_DIGITS))
  const [skuText, setSkuText] = useState(fieldValue(state, "sku") ?? "")
  const skuCategory = categories.find((category) => category.id === categoryId)
  const nextSku = skuCategory?.codePrefix
    ? skuExample(skuCategory.codePrefix, skuCategory.codeDigits)
    : null
  // Nomor lot/seri otomatis = product code + "-" + nomor urut (next_lot_name di database).
  const lotCode = product?.sku ?? (skuText.trim() || nextSku)
  const digits = Number(lotDigits)
  const lotExample =
    lotCode && digits >= 3 && digits <= 10 ? skuExample(`${lotCode}-`, digits) : null
  const trackingNoun = tracking === "serial" ? "nomor seri" : "nomor lot"

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
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {product && <input type="hidden" name="id" value={product.id} />}

      <FormSection title="Data produk">
        <FormField label="Nama produk" htmlFor="name" errors={fieldErrors?.name} span={12}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", product?.name)}
            maxLength={200}
          />
        </FormField>
        {product ? (
          <StaticField label="Product code" value={product.sku} mono reason="Tidak bisa diubah." />
        ) : (
          <FormField
            label="Product code"
            htmlFor="sku"
            errors={fieldErrors?.sku}
            hint={nextSku ? `Kosongkan untuk dibuat otomatis, mis. ${nextSku}.` : undefined}
          >
            <Input
              id="sku"
              name="sku"
              value={skuText}
              onChange={(event) => setSkuText(event.target.value)}
              maxLength={50}
              autoComplete="off"
              className="font-mono"
            />
          </FormField>
        )}
        <FormField label="Kategori produk" htmlFor="categoryId" errors={fieldErrors?.categoryId}>
          <ProductCategorySelect
            id="categoryId"
            name="categoryId"
            options={categories}
            value={categoryId}
            onValueChange={setCategoryId}
            emptyLabel="Tanpa kategori produk"
          />
        </FormField>
        <FormField
          label="Deskripsi"
          htmlFor="description"
          errors={fieldErrors?.description}
          span={12}
        >
          <Textarea
            id="description"
            name="description"
            defaultValue={fieldValue(state, "description", product?.description)}
            maxLength={2000}
            rows={3}
          />
        </FormField>
        <FormField label="Kategori IT Inventory" htmlFor="category" errors={fieldErrors?.category}>
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
        <FormField label="Merk" htmlFor="brand" errors={fieldErrors?.brand} span={4}>
          <Input
            id="brand"
            name="brand"
            defaultValue={fieldValue(state, "brand", product?.brand)}
          />
        </FormField>
        <FormField label="Tipe" htmlFor="model" errors={fieldErrors?.model} span={4}>
          <Input
            id="model"
            name="model"
            defaultValue={fieldValue(state, "model", product?.model)}
          />
        </FormField>
        <FormField label="Ukuran" htmlFor="size" errors={fieldErrors?.size} span={4}>
          <Input id="size" name="size" defaultValue={fieldValue(state, "size", product?.size)} />
        </FormField>
        {product && (
          <CheckboxField
            name="active"
            label="Aktif"
            description="Produk yang diarsipkan tidak bisa dipilih untuk transaksi baru."
            defaultChecked={checked("active", product.active)}
          />
        )}
      </FormSection>

      <FormSection
        title="Lot dan nomor seri"
        description="Produk yang dilacak wajib mencantumkan nomor lot atau nomor seri di setiap barang masuk dan keluar."
      >
        {product?.trackingLocked ? (
          <>
            <StaticField
              label="Pelacakan"
              value={PRODUCT_TRACKING_LABELS[product.tracking]}
              reason="Tidak bisa diubah selama produk punya stok atau transaksi yang belum selesai."
            />
            <input type="hidden" name="tracking" value={product.tracking} />
          </>
        ) : (
          <FormField label="Pelacakan" htmlFor="tracking" errors={fieldErrors?.tracking}>
            <Select
              name="tracking"
              items={TRACKING_ITEMS}
              value={tracking}
              onValueChange={(value) => setTracking((value as ProductTracking | null) ?? "none")}
            >
              <SelectTrigger id="tracking" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRACKING_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
        {tracking !== "none" && lotAuto ? (
          <FormField label="Jumlah digit" htmlFor="lotDigits" errors={fieldErrors?.lotDigits}>
            <Input
              id="lotDigits"
              name="lotDigits"
              value={lotDigits}
              onChange={(event) => setLotDigits(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
            />
          </FormField>
        ) : (
          <input type="hidden" name="lotDigits" value={lotDigits} />
        )}
        {tracking !== "none" && (
          <CheckboxField
            name="lotAuto"
            label={`${trackingNoun[0].toUpperCase()}${trackingNoun.slice(1)} otomatis`}
            description={`Barang masuk yang ${trackingNoun}nya dikosongkan diberi nomor product code + nomor urut saat validasi${lotExample ? `, mis. ${lotExample}` : ""}.${tracking === "serial" ? " Setiap nomor seri ber-qty 1." : ""}`}
            defaultChecked={lotAuto}
            onCheckedChange={setLotAuto}
          />
        )}
      </FormSection>

      <FormSection
        title="Data kepabeanan"
        description="Kode HS wajib diisi sebelum produk bisa dipakai di dokumen BC. Satuan CEISA diisi per barang di dokumen BC."
      >
        <FormField label="Kode HS" htmlFor="hsCode" errors={fieldErrors?.hsCode} span={12}>
          <RefCodeSelect
            id="hsCode"
            type="hs_code"
            name="hsCode"
            defaultValue={product?.hs ?? null}
            placeholder="Cari kode HS atau uraian"
          />
        </FormField>
      </FormSection>
    </form>
  )
}
