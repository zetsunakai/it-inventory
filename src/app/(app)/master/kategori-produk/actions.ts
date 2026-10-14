"use server"

import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { productCategoryFields } from "@/lib/product-category"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { productCategories } from "@/server/db/schema"

// Kategori produk bertingkat (backlog R-01, PRD bagian 5.1): hanya Administrator (izin
// master:write). Induk tidak boleh membentuk lingkaran, nama unik di antara kategori seinduk,
// dan prefix kode unik; semuanya dipaksakan juga di database (migrasi
// product_categories_rules). Pemeriksaan di sini hanya supaya pesannya jelas dan tampil sekaligus.

type CategoryInput = {
  name: string
  parentId: string | null
  codePrefix: string | null
}

// saved = kategori yang sedang diubah; induk yang sudah tersimpan boleh tetap walaupun kini
// diarsipkan.
async function categoryErrors(
  tx: Transaction,
  input: CategoryInput,
  saved?: { id: string; parentId: string | null },
) {
  const errors: string[] = []
  const notSelf = saved ? ne(productCategories.id, saved.id) : undefined

  if (input.parentId && input.parentId !== saved?.parentId) {
    const [parent] = await tx
      .select({ active: productCategories.active })
      .from(productCategories)
      .where(eq(productCategories.id, input.parentId))
    if (!parent?.active) errors.push("Kategori induk tidak ditemukan atau sudah diarsipkan.")
  }
  const [sibling] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        input.parentId
          ? eq(productCategories.parentId, input.parentId)
          : isNull(productCategories.parentId),
        sql`lower(btrim(${productCategories.name})) = lower(${input.name})`,
        notSelf,
      ),
    )
  if (sibling) errors.push(`Nama kategori ${input.name} sudah dipakai di induk yang sama.`)
  if (input.codePrefix) {
    const [taken] = await tx
      .select({ name: productCategories.name })
      .from(productCategories)
      .where(and(eq(productCategories.codePrefix, input.codePrefix), notSelf))
    if (taken) errors.push(`Prefix kode ${input.codePrefix} sudah dipakai kategori ${taken.name}.`)
  }
  return errors
}

export const createProductCategory = defineFormAction({
  name: "createProductCategory",
  permission: "master:write",
  schema: z.object(productCategoryFields).omit({ active: true }),
  successMessage: "Kategori produk ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await categoryErrors(tx, input)
    if (errors.length) throw new AppError(errors)
    const [row] = await tx
      .insert(productCategories)
      .values(input)
      .returning({ id: productCategories.id })
    return row
  },
})

export const updateProductCategory = defineFormAction({
  name: "updateProductCategory",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Kategori produk tidak valid."), ...productCategoryFields }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [saved] = await tx
      .select({ parentId: productCategories.parentId })
      .from(productCategories)
      .where(eq(productCategories.id, id))
    if (!saved) throw new AppError("Kategori produk tidak ditemukan.")
    const errors = await categoryErrors(tx, values, { id, parentId: saved.parentId })
    if (errors.length) throw new AppError(errors)
    await tx.update(productCategories).set(values).where(eq(productCategories.id, id))
    return { id }
  },
})

// Hapus kategori (pola M1-08): hanya yang belum dipakai produk dan tidak punya sub-kategori.
export const deleteProductCategory = defineAction({
  name: "deleteProductCategory",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Kategori produk tidak valid.") }),
  successMessage: "Kategori produk dihapus.",
  handler: ({ input, tx }) =>
    deleteUnlessUsed(tx, productCategories, productCategories.id, input.id, "Kategori produk"),
})
