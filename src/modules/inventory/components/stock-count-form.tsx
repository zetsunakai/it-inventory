"use client"

import { useRouter } from "next/navigation"
import { X } from "lucide-react"
import { useActionState, useEffect, useState } from "react"

import { createStockCount } from "@/modules/inventory/actions/stock-counts"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { FormState } from "@/lib/action-result"
import {
  STOCK_COUNT_INITIAL_COUNTED,
  STOCK_COUNT_INITIAL_COUNTED_LABELS,
  type StockCountInitialCounted,
} from "@/modules/inventory/lib/inventory"
import type { LocationOption, ProductChoice } from "@/modules/inventory/server/queries/transfers"
import { FORM_CLASS, FormActions, FormColumn, FormColumns } from "@/components/layout/form-layout"

const WHOLE_WAREHOUSE = ""
const ALL_CATEGORIES = ""

// Sesi opname baru (Draft): satu gudang, atau satu lokasi beserta sub-lokasinya, opsional satu
// kategori produk beserta sub-kategorinya dan produk tertentu (I-04). Daftar hitung dibuat saat
// mulai hitung (R-13).

const INITIAL_ITEMS = STOCK_COUNT_INITIAL_COUNTED.map((value) => ({
  value,
  label: STOCK_COUNT_INITIAL_COUNTED_LABELS[value],
}))
export function StockCountForm({
  locations,
  categories,
}: {
  locations: LocationOption[]
  categories: { id: string; path: string }[]
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    createStockCount,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const warehouses = [
    ...new Map(
      locations.map((location) => [
        location.warehouseId,
        {
          value: location.warehouseId,
          label: `${location.warehouseCode} · ${location.warehouseName}`,
        },
      ]),
    ).values(),
  ]
  const [warehouseId, setWarehouseId] = useState<string | null>(warehouses[0]?.value ?? null)
  const [locationId, setLocationId] = useState<string | null>(WHOLE_WAREHOUSE)
  const [categoryId, setCategoryId] = useState<string | null>(ALL_CATEGORIES)
  const [products, setProducts] = useState<ProductChoice[]>([])
  const [includeZero, setIncludeZero] = useState(false)
  const [initialCounted, setInitialCounted] = useState<StockCountInitialCounted>("empty")
  const categoryItems = [
    { value: ALL_CATEGORIES, label: "Semua kategori" },
    ...categories.map((category) => ({
      value: category.id,
      label: `${category.path} dan sub-kategorinya`,
    })),
  ]
  const locationItems = [
    { value: WHOLE_WAREHOUSE, label: "Seluruh gudang" },
    ...locations
      .filter((location) => location.warehouseId === warehouseId)
      .map((location) => ({ value: location.id, label: `${location.path} dan sub-lokasinya` })),
  ]

  useEffect(() => {
    if (state?.ok) router.push(`/inventory/opname/${state.data.id}`)
  }, [state, router])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending || !warehouseId}>
          {pending ? "Membuat sesi…" : "Buat"}
        </Button>
      </FormActions>
      <FormErrors errors={state?.ok === false ? state.errors : undefined} />
      <FormSection title="Data opname">
        <FormColumns>
          <FormColumn>
            <FormField label="Gudang" htmlFor="count-warehouse" errors={fieldErrors?.warehouseId}>
              <Select
                name="warehouseId"
                items={warehouses}
                value={warehouseId}
                onValueChange={(value) => {
                  setWarehouseId(value)
                  setLocationId(WHOLE_WAREHOUSE)
                }}
              >
                <SelectTrigger id="count-warehouse" className="w-full">
                  <SelectValue placeholder="Pilih gudang" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Lingkup" htmlFor="count-location" errors={fieldErrors?.locationId}>
              <Select
                name="locationId"
                items={locationItems}
                value={locationId}
                onValueChange={setLocationId}
              >
                <SelectTrigger id="count-location" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locationItems.map((item) => (
                    <SelectItem key={item.value || "semua"} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormColumn>
          <FormColumn>
            <FormField
              label="Kategori produk"
              htmlFor="count-category"
              errors={fieldErrors?.productCategoryId}
            >
              <Select
                name="productCategoryId"
                items={categoryItems}
                value={categoryId}
                onValueChange={setCategoryId}
              >
                <SelectTrigger id="count-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value || "semua"} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormColumn>
        </FormColumns>
      </FormSection>
      <FormSection title="Lingkup produk dan isi awal">
        <FormColumns>
          <FormColumn>
            <FormField
              label="Produk tertentu"
              htmlFor="count-products"
              errors={fieldErrors?.productIds}
              hint="Kosongkan untuk menghitung semua produk di kategori yang dipilih."
            >
              <input
                type="hidden"
                name="productIds"
                value={JSON.stringify(products.map((product) => product.id))}
              />
              <SearchSelect<ProductChoice>
                id="count-products"
                endpoint="/api/products"
                value={null}
                onValueChange={(product) => {
                  if (product && !products.some((item) => item.id === product.id)) {
                    setProducts([...products, product])
                  }
                }}
                getKey={(item) => item.id}
                getLabel={(item) => `[${item.sku}] ${item.name}`}
                placeholder="Cari product code atau nama, lalu pilih"
              />
              {products.length > 0 && (
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {products.map((product) => (
                    <li
                      key={product.id}
                      className="inline-flex items-center gap-1 rounded-md bg-muted py-0.5 pr-1 pl-2 text-caption"
                    >
                      <span className="font-mono">{product.sku}</span> {product.name}
                      <button
                        type="button"
                        aria-label={`Hapus ${product.sku}`}
                        onClick={() =>
                          setProducts(products.filter((item) => item.id !== product.id))
                        }
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          </FormColumn>
          <FormColumn>
            <FormField
              label="Qty hitung awal"
              htmlFor="count-initial"
              errors={fieldErrors?.initialCounted}
              hint="Kosong membuat penghitung mengisi setiap baris (hitung buta)."
            >
              <Select
                name="initialCounted"
                items={INITIAL_ITEMS}
                value={initialCounted}
                onValueChange={(value) => value && setInitialCounted(value)}
              >
                <SelectTrigger id="count-initial" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INITIAL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <label className="flex items-start gap-2 text-control">
              <input type="hidden" name="includeZeroStock" value={String(includeZero)} />
              <Checkbox
                checked={includeZero}
                onCheckedChange={(checked) => setIncludeZero(checked === true)}
                className="mt-0.5"
              />
              <span>
                Sertakan produk tanpa stok
                <span className="block text-caption text-muted-foreground">
                  Produk tanpa pelacakan yang tidak punya stok ikut dihitung dengan qty sistem 0.
                </span>
              </span>
            </label>
          </FormColumn>
        </FormColumns>
        <FormField label="Catatan" htmlFor="count-notes" errors={fieldErrors?.notes} span={12}>
          <Textarea id="count-notes" name="notes" rows={2} />
        </FormField>
      </FormSection>
    </form>
  )
}
