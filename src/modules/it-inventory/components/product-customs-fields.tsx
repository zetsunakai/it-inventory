"use client"

import type { ReactNode } from "react"

import { FormField, FormSection } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RefCodeOption } from "@/lib/ref-codes"
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryCategory,
} from "@/modules/inventory/lib/inventory"

// Field kepabeanan di form produk (S-01): milik modul IT Inventory, dipasang di form produk
// inventory oleh lapisan rute. Aturannya di lib/product-customs.ts.

const CATEGORY_ITEMS = INVENTORY_CATEGORIES.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}))

// Kategori laporan IT Inventory (PRD 9.2), di kelompok Data kepabeanan.
export function CustomsCategoryField({
  defaultValue,
  errors,
}: {
  defaultValue: InventoryCategory | null
  errors?: string[]
}) {
  return (
    <FormField label="Kategori IT Inventory" htmlFor="category" errors={errors}>
      <Select name="category" items={CATEGORY_ITEMS} defaultValue={defaultValue}>
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
  )
}

// Kelompok Data kepabeanan: atribut produk dan kode HS (syarat siap dokumen BC).
export function ProductCustomsSection({
  hs,
  errors,
  children,
}: {
  hs: RefCodeOption | null
  errors?: string[]
  children?: ReactNode
}) {
  return (
    <FormSection
      title="Data kepabeanan"
      description="Kode HS wajib diisi sebelum produk bisa dipakai di dokumen BC. Satuan CEISA diisi per barang di dokumen BC."
    >
      {children}
      <FormField label="Kode HS" htmlFor="hsCode" errors={errors} span={12}>
        <RefCodeSelect
          id="hsCode"
          type="hs_code"
          name="hsCode"
          defaultValue={hs}
          placeholder="Cari kode HS atau uraian"
        />
      </FormField>
    </FormSection>
  )
}
