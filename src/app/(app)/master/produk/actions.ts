"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { checkbox } from "@/lib/form-fields"
import {
  ALWAYS,
  autoLotNeedsTracking,
  newSkuField,
  productFields,
} from "@/modules/inventory/lib/product"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { products } from "@/server/db/schema"
import { productCategoryErrors, productUomErrors } from "@/modules/inventory/server/product-checks"
import { importFileSchema, readImportFile } from "@/server/master-io/common"
import {
  importProductRows,
  PRODUCT_COLUMNS,
  RETIRED_PRODUCT_COLUMNS,
} from "@/modules/it-inventory/server/master-io/products"
import { productCustomsFields } from "@/modules/it-inventory/lib/product-customs"
import { customsCodeErrors } from "@/modules/it-inventory/server/product-customs"

// Produk (PRD bagian 5.1): hanya Administrator (izin master:write). Product code (kolom sku) dan
// satuan stok tidak bisa diubah setelah dibuat (trigger products_guard). Product code produk baru
// boleh dikosongkan bila kategori produknya punya prefix kode; database yang membuatnya (backlog
// R-01). Kode HS boleh menyusul; selama kosong produk berstatus "belum siap dokumen BC" (kolom
// customs_ready). Satuan CEISA diisi per baris dokumen BC (RM-01).

export const createProduct = defineFormAction({
  name: "createProduct",
  permission: "master:write",
  schema: z
    .object({
      sku: newSkuField,
      uomId: z.uuid("Satuan stok wajib dipilih."),
      ...productFields,
      ...productCustomsFields,
    })
    .superRefine(autoLotNeedsTracking, ALWAYS),
  successMessage: "Produk ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await productCategoryErrors(tx, input.categoryId, { needsPrefix: !input.sku })
    errors.push(...(await customsCodeErrors(tx, input)))
    if (input.sku) {
      const [existing] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, input.sku))
      if (existing) errors.unshift(`Product code ${input.sku} sudah dipakai.`)
    }
    errors.push(...(await productUomErrors(tx, input.uomId)))
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
    .object({
      id: z.uuid("Produk tidak valid."),
      ...productFields,
      ...productCustomsFields,
      active: checkbox,
    })
    .superRefine(autoLotNeedsTracking, ALWAYS),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [saved] = await tx
      .select({
        sku: products.sku,
        categoryId: products.categoryId,
        hsCode: products.hsCode,
      })
      .from(products)
      .where(eq(products.id, id))
    if (!saved) throw new AppError("Produk tidak ditemukan.")
    const errors = await productCategoryErrors(tx, values.categoryId, { saved: saved.categoryId })
    errors.push(...(await customsCodeErrors(tx, values, saved)))
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
    importProductRows(
      tx,
      await readImportFile(input.file, PRODUCT_COLUMNS, "sku", RETIRED_PRODUCT_COLUMNS),
    ),
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
