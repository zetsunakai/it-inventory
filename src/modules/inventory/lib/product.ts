import { z } from "zod"

import { checkbox, optionalText, requiredText } from "@/lib/form-fields"
import { PRODUCT_TRACKINGS } from "./inventory"
import { DEFAULT_CODE_DIGITS } from "./product-category"

// Field produk (PRD bagian 5.1) yang dipakai bersama oleh form produk dan import (M1-07),
// supaya aturan validasinya hanya ada di satu tempat. Field kepabeanan (kategori IT Inventory,
// kode HS) milik modul IT Inventory: productCustomsFields di it-inventory/lib/product-customs
// (pemisahan modul S-01); form dan import produk menggabungkan keduanya.

export const productFields = {
  name: requiredText("Nama produk", 200),
  // Kategori produk (boleh kosong).
  categoryId: z
    .union([z.uuid("Kategori produk tidak valid."), z.literal("")])
    .optional()
    .transform((value) => value || null),
  description: optionalText("Deskripsi", 2000),
  brand: optionalText("Merk", 100),
  model: optionalText("Tipe", 100),
  size: optionalText("Ukuran", 100),
  // Kosong = tanpa pelacakan.
  tracking: z.enum(PRODUCT_TRACKINGS, "Pilih pelacakan produk.").default("none"),
  // Nomor lot/seri otomatis untuk barang masuk (product code + nomor urut); tidak = selalu
  // diisi manual.
  lotAuto: checkbox,
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

export const skuField = requiredText("Product code", 50)

// Produk baru: product code boleh dikosongkan bila kategori produknya punya prefix kode; database yang
// membuatnya (next_product_sku).
export const newSkuField = z.string().trim().max(50, "Product code maksimal 50 karakter.")

// Nomor otomatis hanya untuk produk yang dilacak (dipaksakan juga di database).
export function autoLotNeedsTracking(
  input: { tracking?: string; lotAuto: boolean },
  ctx: z.RefinementCtx,
) {
  if (input.lotAuto && input.tracking === "none") {
    ctx.addIssue({
      code: "custom",
      path: ["lotAuto"],
      message: "Nomor lot/seri otomatis hanya untuk produk yang dilacak per lot atau nomor seri.",
    })
  }
}

// Pemeriksaan lintas field tetap dijalankan walaupun field lain gagal, supaya semua
// kesalahan tampil sekaligus.
export const ALWAYS = { when: () => true }
