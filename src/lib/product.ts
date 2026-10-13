import { z } from "zod"

import { checkbox, optionalDecimal, optionalText, requiredText } from "./form-fields"
import { INVENTORY_CATEGORIES } from "./inventory"

// Field produk (PRD bagian 5.1) yang dipakai bersama oleh form produk dan import (M1-07),
// supaya aturan validasinya hanya ada di satu tempat.

export const productFields = {
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

export const skuField = requiredText("SKU", 50)

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
