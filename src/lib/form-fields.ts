import { z } from "zod"

import { parseDecimalInput } from "./decimal"

// Field zod untuk input dari form (semua nilai FormData berupa string). Pesan error dalam
// bahasa Indonesia dan memakai label field, supaya bisa ditampilkan sekaligus (PRD 7.6).

export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(max, `${label} maksimal ${max} karakter.`)
}

// Kosong menjadi null.
export function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter.`)
    .optional()
    .transform((value) => value || null)
}

// Checkbox hanya terkirim saat dicentang.
export const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on")

// Angka desimal positif sebagai string (tanpa float), koma atau titik sebagai pemisah.
export function decimal(label: string, scale: number) {
  return z.string().transform((value, ctx) => {
    const parsed = parseDecimalInput(value, scale)
    if (!parsed) {
      ctx.addIssue({
        code: "custom",
        message: `${label} harus angka lebih dari 0, maksimal ${scale} desimal.`,
      })
      return z.NEVER
    }
    return parsed
  })
}

// Seperti decimal(), tapi boleh kosong (menjadi null).
export function optionalDecimal(label: string, scale: number) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value?.trim()) return null
      const parsed = parseDecimalInput(value, scale)
      if (!parsed) {
        ctx.addIssue({
          code: "custom",
          message: `${label} harus angka lebih dari 0, maksimal ${scale} desimal.`,
        })
        return z.NEVER
      }
      return parsed
    })
}
