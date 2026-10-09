"use server"

import { eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { parseDecimalInput } from "@/lib/decimal"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { uomCategories, uoms } from "@/server/db/schema"

// Satuan dan konversi (PRD bagian 5.1): hanya Administrator (izin master:write).
// Kode, kategori, dan status acuan sebuah satuan tidak bisa diubah (trigger uoms_guard).

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} karakter.`)

const FACTOR_SCALE = 10

const factor = z.string().transform((value, ctx) => {
  const parsed = parseDecimalInput(value, FACTOR_SCALE)
  if (!parsed) {
    ctx.addIssue({
      code: "custom",
      message: `Faktor harus angka lebih dari 0, maksimal ${FACTOR_SCALE} desimal.`,
    })
    return z.NEVER
  }
  return parsed
})

const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on")

async function takenUomCodes(tx: Transaction, codes: string[]) {
  const rows = await tx.select({ code: uoms.code }).from(uoms).where(inArray(uoms.code, codes))
  return rows.map((row) => `Kode satuan ${row.code} sudah dipakai.`)
}

// Kategori baru selalu bersama satuan acuannya: tanpa acuan, kategori tidak bisa dipakai konversi.
export const createUomCategory = defineFormAction({
  name: "createUomCategory",
  permission: "master:write",
  schema: z.object({
    code: text("Kode kategori", 30),
    name: text("Nama kategori", 100),
    referenceCode: text("Kode satuan acuan", 20),
    referenceName: text("Nama satuan acuan", 100),
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
    code: text("Kode satuan", 20),
    name: text("Nama satuan", 100),
    factor,
  }),
  successMessage: "Satuan ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await takenUomCodes(tx, [input.code])
    const [category] = await tx
      .select({ id: uomCategories.id })
      .from(uomCategories)
      .where(eq(uomCategories.id, input.categoryId))
    if (!category) errors.unshift("Kategori satuan tidak ditemukan.")
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
    name: text("Nama satuan", 100),
    factor,
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
