"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { checkbox } from "@/lib/form-fields"
import { ALWAYS, pairCeisaUnit, productFields, skuField } from "@/lib/product"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"
import { products, uomCategories, uoms } from "@/server/db/schema"
import { importFileSchema, readImportFile } from "@/server/master-io/common"
import { importProductRows, PRODUCT_COLUMNS } from "@/server/master-io/products"

// Produk (PRD bagian 5.1): hanya Administrator (izin master:write). SKU dan satuan stok tidak
// bisa diubah setelah dibuat (trigger products_guard). Kode HS dan satuan CEISA boleh menyusul;
// selama belum lengkap produk berstatus "belum siap dokumen BC" (kolom customs_ready).

type ProductFields = {
  hsCode: string | null
  ceisaUnitCode: string | null
}

// Kode HS dan satuan CEISA harus ada di referensi kepabeanan dan aktif
// (kecuali sudah tersimpan sebelumnya).
async function customsCodeErrors(
  tx: Transaction,
  input: ProductFields,
  saved?: { hsCode: string | null; ceisaUnitCode: string | null },
) {
  const errors: string[] = []
  if (input.hsCode && !(await refCodeIsUsable(tx, "hs_code", input.hsCode, saved?.hsCode))) {
    errors.push(`Kode HS ${input.hsCode} tidak ada di referensi kepabeanan.`)
  }
  if (
    input.ceisaUnitCode &&
    !(await refCodeIsUsable(tx, "ceisa_unit", input.ceisaUnitCode, saved?.ceisaUnitCode))
  ) {
    errors.push(`Satuan CEISA ${input.ceisaUnitCode} tidak ada di referensi kepabeanan.`)
  }
  return errors
}

export const createProduct = defineFormAction({
  name: "createProduct",
  permission: "master:write",
  schema: z
    .object({
      sku: skuField,
      uomId: z.uuid("Satuan stok wajib dipilih."),
      ...productFields,
    })
    .superRefine(pairCeisaUnit, ALWAYS),
  successMessage: "Produk ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await customsCodeErrors(tx, input)
    const [existing] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, input.sku))
    if (existing) errors.unshift(`SKU ${input.sku} sudah dipakai.`)
    const [uom] = await tx
      .select({ id: uoms.id })
      .from(uoms)
      .innerJoin(uomCategories, eq(uomCategories.id, uoms.categoryId))
      .where(and(eq(uoms.id, input.uomId), eq(uoms.active, true), eq(uomCategories.active, true)))
    if (!uom) errors.push("Satuan stok tidak ditemukan atau sudah diarsipkan.")
    if (errors.length) throw new AppError(errors)

    const [row] = await tx
      .insert(products)
      .values(input)
      .returning({ id: products.id, sku: products.sku })
    return row
  },
})

export const updateProduct = defineFormAction({
  name: "updateProduct",
  permission: "master:write",
  schema: z
    .object({ id: z.uuid("Produk tidak valid."), ...productFields, active: checkbox })
    .superRefine(pairCeisaUnit, ALWAYS),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [saved] = await tx
      .select({
        sku: products.sku,
        hsCode: products.hsCode,
        ceisaUnitCode: products.ceisaUnitCode,
      })
      .from(products)
      .where(eq(products.id, id))
    if (!saved) throw new AppError("Produk tidak ditemukan.")
    const errors = await customsCodeErrors(tx, values, saved)
    if (errors.length) throw new AppError(errors)

    await tx.update(products).set(values).where(eq(products.id, id))
    return { id, sku: saved.sku }
  },
})

// Import produk dari Excel/CSV (backlog M1-07). Semua baris divalidasi dulu; bila ada yang salah,
// tidak ada yang disimpan dan hasilnya berisi kesalahan per baris.
export const importProducts = defineFormAction({
  name: "importProducts",
  permission: "master:write",
  schema: importFileSchema,
  handler: async ({ input, tx }) =>
    importProductRows(tx, await readImportFile(input.file, PRODUCT_COLUMNS, "sku")),
})

// Hapus produk (backlog M1-08): hanya produk yang belum dipakai. Database menolak bila produk
// sudah dirujuk data lain (foreign key restrict); produk itu diarsipkan saja.
export const deleteProduct = defineAction({
  name: "deleteProduct",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Produk tidak valid.") }),
  successMessage: "Produk dihapus.",
  handler: ({ input, tx }) => deleteUnlessUsed(tx, products, products.id, input.id, "Produk"),
})
