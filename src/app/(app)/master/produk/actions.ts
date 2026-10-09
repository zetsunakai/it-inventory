"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { checkbox, optionalDecimal, optionalText, requiredText } from "@/lib/form-fields"
import { INVENTORY_CATEGORIES } from "@/lib/inventory"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"
import { products, uomCategories, uoms } from "@/server/db/schema"

// Produk (PRD bagian 5.1): hanya Administrator (izin master:write). SKU dan satuan stok tidak
// bisa diubah setelah dibuat (trigger products_guard). Kode HS dan satuan CEISA boleh menyusul;
// selama belum lengkap produk berstatus "belum siap dokumen BC" (kolom customs_ready).

const fields = {
  name: requiredText("Nama produk", 200),
  description: optionalText("Deskripsi", 2000),
  category: z.enum(INVENTORY_CATEGORIES, "Kategori IT Inventory wajib dipilih."),
  hsCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || /^\d{8}$/.test(value), "Kode HS harus 8 digit."),
  ceisaUnitCode: optionalText("Satuan CEISA", 20),
  ceisaFactor: optionalDecimal("Faktor satuan CEISA", 10),
  netWeight: optionalDecimal("Berat netto", 6),
  brand: optionalText("Merk", 100),
  model: optionalText("Tipe", 100),
  size: optionalText("Ukuran", 100),
  lotRequired: checkbox,
}

type ProductFields = {
  hsCode: string | null
  ceisaUnitCode: string | null
  ceisaFactor: string | null
}

// Pemeriksaan lintas field tetap dijalankan walaupun field lain gagal, supaya semua
// kesalahan tampil sekaligus.
const ALWAYS = { when: () => true }

// Satuan CEISA dan faktornya berpasangan (dipaksakan juga di database).
function pairCeisaUnit(input: ProductFields, ctx: z.RefinementCtx) {
  if (input.ceisaUnitCode && !input.ceisaFactor) {
    ctx.addIssue({
      code: "custom",
      path: ["ceisaFactor"],
      message: "Faktor satuan CEISA wajib diisi bila satuan CEISA dipilih.",
    })
  }
  if (!input.ceisaUnitCode && input.ceisaFactor) {
    ctx.addIssue({
      code: "custom",
      path: ["ceisaUnitCode"],
      message: "Pilih satuan CEISA untuk faktor yang diisi.",
    })
  }
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
      sku: requiredText("SKU", 50),
      uomId: z.uuid("Satuan stok wajib dipilih."),
      ...fields,
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
    .object({ id: z.uuid("Produk tidak valid."), ...fields, active: checkbox })
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
