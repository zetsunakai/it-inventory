"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
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
import { toDecimalInput } from "@/lib/decimal"
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  PRODUCT_TRACKING_LABELS,
  PRODUCT_TRACKINGS,
  type ProductTracking,
  type InventoryCategory,
} from "@/lib/inventory"
import { CODE_PREFIX_PATTERN, DEFAULT_CODE_DIGITS, skuExample } from "@/lib/product-category"
import type { RefCodeOption } from "@/lib/ref-codes"
import type { ProductCategoryOption } from "@/server/queries/product-categories"
import type { UomOption } from "@/server/queries/products"

import { createProduct, updateProduct } from "./actions"

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
  ceisaUnit: RefCodeOption | null
  ceisaFactor: string | null
  netWeight: string | null
  brand: string | null
  model: string | null
  size: string | null
  tracking: ProductTracking
  lotPrefix: string | null
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
  const [uomId, setUomId] = useState<string | null>(null)
  const [ceisaUnit, setCeisaUnit] = useState(product?.ceisaUnit ?? null)
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "")
  const [tracking, setTracking] = useState<ProductTracking>(product?.tracking ?? "none")
  const [lotPrefix, setLotPrefix] = useState(product?.lotPrefix ?? "")
  const [lotDigits, setLotDigits] = useState(String(product?.lotDigits ?? DEFAULT_CODE_DIGITS))
  const cleanLotPrefix = lotPrefix.trim().toUpperCase()
  const lotExample =
    CODE_PREFIX_PATTERN.test(cleanLotPrefix) && Number(lotDigits) >= 3 && Number(lotDigits) <= 10
      ? skuExample(cleanLotPrefix, Number(lotDigits))
      : null
  const trackingNoun = tracking === "serial" ? "nomor seri" : "nomor lot"
  const skuCategory = categories.find((category) => category.id === categoryId)
  const nextSku = skuCategory?.codePrefix
    ? skuExample(skuCategory.codePrefix, skuCategory.codeDigits)
    : null
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
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          {product ? (
            <StaticField label="SKU" value={product.sku} mono reason="Tidak bisa diubah." />
          ) : (
            <FormField
              label="SKU"
              htmlFor="sku"
              errors={fieldErrors?.sku}
              hint={nextSku ? `Kosongkan untuk dibuat otomatis, mis. ${nextSku}.` : undefined}
            >
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
      </FormSection>

      <FormSection
        title="Lot dan nomor seri"
        description="Produk yang dilacak wajib mencantumkan nomor lot atau nomor seri di setiap barang masuk dan keluar."
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem_8rem]">
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
          {tracking !== "none" ? (
            <>
              <FormField
                label="Prefix nomor otomatis"
                htmlFor="lotPrefix"
                errors={fieldErrors?.lotPrefix}
              >
                <Input
                  id="lotPrefix"
                  name="lotPrefix"
                  value={lotPrefix}
                  onChange={(event) => setLotPrefix(event.target.value)}
                  maxLength={10}
                  autoComplete="off"
                  className="font-mono uppercase"
                />
              </FormField>
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
            </>
          ) : (
            <input type="hidden" name="lotDigits" value={lotDigits} />
          )}
        </div>
        {tracking !== "none" && (
          <p className="text-caption text-muted-foreground">
            {lotExample
              ? `Barang masuk yang ${trackingNoun}nya dikosongkan diberi nomor otomatis saat validasi, mis. ${lotExample}.`
              : `Kosongkan prefix bila ${trackingNoun} selalu diisi manual.`}
            {tracking === "serial" && " Setiap nomor seri ber-qty 1."}
          </p>
        )}
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
