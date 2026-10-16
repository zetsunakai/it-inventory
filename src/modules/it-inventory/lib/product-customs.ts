import { z } from "zod"

import { INVENTORY_CATEGORIES } from "@/modules/inventory/lib/inventory"

// Data kepabeanan produk (PRD bagian 5.1, 5.3) milik modul IT Inventory (S-01), seperti
// it_inventory_product_type di core_it_inventory hmx yang memperluas produk core_product. Kolomnya
// tetap di tabel products; field form dan aturannya ada di sini, digabung dengan productFields
// inventory oleh form dan import produk.
export const productCustomsFields = {
  // Kategori laporan IT Inventory (PRD 9.2), disalin ke pergerakan saat Selesai.
  category: z.enum(INVENTORY_CATEGORIES, "Kategori IT Inventory wajib dipilih."),
  // Boleh menyusul; selama kosong produk berstatus "belum siap dokumen BC" (customs_ready).
  hsCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null)
    .refine((value) => value === null || /^\d{8}$/.test(value), "Kode HS harus 8 digit."),
}
