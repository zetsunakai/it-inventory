import "server-only"

import { and, eq } from "drizzle-orm"

import type { Transaction } from "@/server/db/audit"
import { productCategories, uomCategories, uoms } from "@/server/db/schema"

// Kategori harus aktif, kecuali nilai yang sudah tersimpan. SKU otomatis membutuhkan prefix.
export async function productCategoryErrors(
  tx: Transaction,
  categoryId: string | null,
  { saved, needsPrefix = false }: { saved?: string | null; needsPrefix?: boolean } = {},
) {
  if (!categoryId) {
    return needsPrefix ? ["Product code wajib diisi bila kategori produk tidak dipilih."] : []
  }
  const [category] = await tx
    .select({
      name: productCategories.name,
      active: productCategories.active,
      codePrefix: productCategories.codePrefix,
    })
    .from(productCategories)
    .where(eq(productCategories.id, categoryId))
  if (!category || (!category.active && categoryId !== saved)) {
    return ["Kategori produk tidak ditemukan atau sudah diarsipkan."]
  }
  if (needsPrefix && !category.codePrefix) {
    return [
      `Product code wajib diisi karena kategori produk ${category.name} tidak punya prefix kode.`,
    ]
  }
  return []
}

export async function productUomErrors(tx: Transaction, uomId: string) {
  const [uom] = await tx
    .select({ id: uoms.id })
    .from(uoms)
    .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
    .where(and(eq(uoms.id, uomId), eq(uoms.active, true), eq(uomCategories.active, true)))
  return uom ? [] : ["Satuan stok tidak ditemukan atau sudah diarsipkan."]
}
