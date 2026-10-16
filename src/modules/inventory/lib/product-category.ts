import { z } from "zod"

import { checkbox, requiredText } from "@/lib/form-fields"

// Kategori produk bertingkat (PRD bagian 5.1, backlog R-01). Aturan yang sama dipaksakan juga di
// database (migrasi product_categories_rules).

export const CODE_PREFIX_PATTERN = /^[A-Z0-9][A-Z0-9/-]{0,9}$/

export const DEFAULT_CODE_DIGITS = 6

// Contoh SKU yang akan dibuat untuk prefix dan jumlah digit ini, mis. "BB-000001".
export function skuExample(prefix: string, digits: number) {
  return `${prefix}${"1".padStart(digits, "0")}`
}

export const productCategoryFields = {
  // "/" dipakai sebagai pemisah jalur kategori.
  name: requiredText("Nama kategori", 100).refine(
    (value) => !value.includes("/"),
    "Nama kategori tidak boleh berisi /.",
  ),
  // Kosong = kategori teratas.
  parentId: z
    .union([z.uuid("Kategori induk tidak valid."), z.literal("")])
    .optional()
    .transform((value) => value || null),
  // Kosong = SKU produk di kategori ini selalu diisi manual.
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((value) => value || null)
    .refine(
      (value) => value === null || CODE_PREFIX_PATTERN.test(value),
      "Prefix kode maksimal 10 karakter: huruf, angka, - atau /, diawali huruf atau angka.",
    ),
  codeDigits: z.coerce
    .number("Jumlah digit harus angka.")
    .int("Jumlah digit harus bilangan bulat.")
    .min(3, "Jumlah digit minimal 3.")
    .max(10, "Jumlah digit maksimal 10."),
  active: checkbox,
}
