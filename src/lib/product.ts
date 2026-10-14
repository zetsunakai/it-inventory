import { z } from "zod"

import { optionalDecimal, optionalText, requiredText } from "./form-fields"
import { INVENTORY_CATEGORIES, PRODUCT_TRACKINGS } from "./inventory"
import { CODE_PREFIX_PATTERN, DEFAULT_CODE_DIGITS } from "./product-category"

// Field produk (PRD bagian 5.1) yang dipakai bersama oleh form produk dan import (M1-07),
// supaya aturan validasinya hanya ada di satu tempat.

export const productFields = {
  name: requiredText("Nama produk", 200),
  // Kategori produk (boleh kosong); kategori IT Inventory di field category.
  categoryId: z
    .union([z.uuid("Kategori produk tidak valid."), z.literal("")])
    .optional()
    .transform((value) => value || null),
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
  // Kosong = tanpa pelacakan.
  tracking: z.enum(PRODUCT_TRACKINGS, "Pilih pelacakan produk.").default("none"),
  // Nomor lot/seri otomatis untuk barang masuk; kosong = selalu diisi manual.
  lotPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((value) => value || null)
    .refine(
      (value) => value === null || CODE_PREFIX_PATTERN.test(value),
      "Prefix nomor lot/seri maksimal 10 karakter: huruf, angka, - atau /, diawali huruf atau angka.",
    ),
  // Kosong = 6 digit.
  lotDigits: z
    .string()
    .optional()
    .transform((value) => value?.trim() || String(DEFAULT_CODE_DIGITS))
    .pipe(z.coerce.number("Jumlah digit nomor lot/seri harus angka."))
    .pipe(
      z
        .number()
        .int("Jumlah digit nomor lot/seri harus bilangan bulat.")
        .min(3, "Jumlah digit nomor lot/seri minimal 3.")
        .max(10, "Jumlah digit nomor lot/seri maksimal 10."),
    ),
}

export const skuField = requiredText("SKU", 50)

// Produk baru: SKU boleh dikosongkan bila kategori produknya punya prefix kode; database yang
// membuatnya (next_product_sku).
export const newSkuField = z.string().trim().max(50, "SKU maksimal 50 karakter.")

// Prefix nomor otomatis hanya untuk produk yang dilacak (dipaksakan juga di database).
export function prefixNeedsTracking(
  input: { tracking?: string; lotPrefix: string | null },
  ctx: z.RefinementCtx,
) {
  if (input.lotPrefix && input.tracking === "none") {
    ctx.addIssue({
      code: "custom",
      path: ["lotPrefix"],
      message: "Prefix nomor lot/seri hanya untuk produk yang dilacak per lot atau nomor seri.",
    })
  }
}

type CeisaUnitFields = { ceisaUnitCode: string | null; ceisaFactor: string | null }

// Pemeriksaan lintas field tetap dijalankan walaupun field lain gagal, supaya semua
// kesalahan tampil sekaligus.
export const ALWAYS = { when: () => true }

// Satuan CEISA dan faktornya berpasangan (dipaksakan juga di database).
export function pairCeisaUnit(input: CeisaUnitFields, ctx: z.RefinementCtx) {
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
