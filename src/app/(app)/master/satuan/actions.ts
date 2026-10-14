"use server"

import { and, eq, inArray, isNull, or } from "drizzle-orm"
import { z } from "zod"

import { checkbox, decimal, requiredText } from "@/lib/form-fields"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { products, uomCategories, uoms } from "@/server/db/schema"

// Satuan dan konversi (PRD bagian 5.1): hanya Administrator (izin master:write).
// Kode, kategori, dan status acuan sebuah satuan tidak bisa diubah (trigger uoms_guard).

const factor = decimal("Faktor", 10)
// Kelipatan hasil konversi ke satuan ini (R-03); kosong = 0,0001 (presisi qty).
const rounding = z
  .string()
  .optional()
  .transform((value) => value?.trim() || "0,0001")
  .pipe(decimal("Pembulatan", 4))

// Kode satuan umum tidak boleh sama dengan satuan mana pun; kode satuan khusus produk tidak boleh
// sama dengan satuan umum atau satuan khusus lain milik produk yang sama (dipaksakan juga di
// database).
async function takenUomCodes(tx: Transaction, codes: string[], productId: string | null = null) {
  const rows = await tx
    .select({ code: uoms.code })
    .from(uoms)
    .where(
      and(
        inArray(uoms.code, codes),
        productId ? or(isNull(uoms.productId), eq(uoms.productId, productId)) : undefined,
      ),
    )
  return rows.map((row) => `Kode satuan ${row.code} sudah dipakai.`)
}

// Kategori baru selalu bersama satuan acuannya: tanpa acuan, kategori tidak bisa dipakai konversi.
export const createUomCategory = defineFormAction({
  name: "createUomCategory",
  permission: "master:write",
  schema: z.object({
    code: requiredText("Kode kategori", 30),
    name: requiredText("Nama kategori", 100),
    referenceCode: requiredText("Kode satuan acuan", 20),
    referenceName: requiredText("Nama satuan acuan", 100),
  }),
  successMessage: "Kategori satuan ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await takenUomCodes(tx, [input.referenceCode])
    const [existing] = await tx
      .select({ id: uomCategories.id })
      .from(uomCategories)
      .where(eq(uomCategories.code, input.code))
    if (existing) errors.unshift(`Kode kategori ${input.code} sudah dipakai.`)
    if (errors.length) throw new AppError(errors)

    const [category] = await tx
      .insert(uomCategories)
      .values({ code: input.code, name: input.name })
      .returning({ id: uomCategories.id })
    await tx.insert(uoms).values({
      code: input.referenceCode,
      name: input.referenceName,
      categoryId: category.id,
      factor: "1",
      isReference: true,
    })
    return category
  },
})

export const createUom = defineFormAction({
  name: "createUom",
  permission: "master:write",
  schema: z.object({
    categoryId: z.uuid("Kategori satuan wajib dipilih."),
    code: requiredText("Kode satuan", 20),
    name: requiredText("Nama satuan", 100),
    factor,
    rounding,
    // Kosong = satuan umum untuk semua produk.
    productId: z
      .union([z.uuid("Produk tidak valid."), z.literal("")])
      .optional()
      .transform((value) => value || null),
  }),
  successMessage: "Satuan ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await takenUomCodes(tx, [input.code], input.productId)
    if (input.productId) {
      const [product] = await tx
        .select({ active: products.active, categoryId: uoms.categoryId })
        .from(products)
        .innerJoin(uoms, eq(uoms.id, products.uomId))
        .where(eq(products.id, input.productId))
      if (!product?.active) errors.push("Produk tidak ditemukan atau sudah diarsipkan.")
      else if (product.categoryId !== input.categoryId) {
        errors.push("Satuan khusus harus sekategori dengan satuan stok produknya.")
      }
    }
    const [category] = await tx
      .select({ active: uomCategories.active })
      .from(uomCategories)
      .where(eq(uomCategories.id, input.categoryId))
    if (!category?.active) errors.unshift("Kategori satuan tidak ditemukan atau sudah diarsipkan.")
    if (errors.length) throw new AppError(errors)

    const [row] = await tx.insert(uoms).values(input).returning({ id: uoms.id })
    return row
  },
})

export const updateUom = defineFormAction({
  name: "updateUom",
  permission: "master:write",
  schema: z.object({
    id: z.uuid("Satuan tidak valid."),
    name: requiredText("Nama satuan", 100),
    factor,
    rounding,
    active: checkbox,
  }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [current] = await tx
      .select({ isReference: uoms.isReference })
      .from(uoms)
      .where(eq(uoms.id, id))
    if (!current) throw new AppError("Satuan tidak ditemukan.")
    if (current.isReference && values.factor !== "1") {
      throw new AppError("Faktor satuan acuan selalu 1.")
    }
    await tx.update(uoms).set(values).where(eq(uoms.id, id))
    return { id }
  },
})

// Hapus satuan (backlog M1-08): hanya satuan yang belum dipakai produk. Satuan acuan tidak bisa
// dihapus karena faktor satuan lain di kategorinya dihitung terhadapnya.
export const deleteUom = defineAction({
  name: "deleteUom",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Satuan tidak valid.") }),
  successMessage: "Satuan dihapus.",
  handler: async ({ input, tx }) => {
    const [uom] = await tx
      .select({ isReference: uoms.isReference })
      .from(uoms)
      .where(eq(uoms.id, input.id))
    if (!uom) throw new AppError("Satuan tidak ditemukan.")
    if (uom.isReference) {
      throw new AppError("Satuan acuan tidak bisa dihapus. Arsipkan saja bila tidak dipakai lagi.")
    }
    await deleteUnlessUsed(tx, uoms, uoms.id, input.id, "Satuan")
  },
})
