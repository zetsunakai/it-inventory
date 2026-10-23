import { z } from "zod"

import { requiredText } from "@/lib/form-fields"
import { WAREHOUSE_LOCATION_TYPES } from "./inventory"

export const warehouseLocationRowSchema = z.object({
  id: z.uuid("Identitas baris lokasi tidak valid."),
  isNew: z.boolean(),
  code: requiredText("Kode lokasi", 30),
  name: requiredText("Nama lokasi", 200),
  type: z.enum(WAREHOUSE_LOCATION_TYPES, "Tipe lokasi tidak valid."),
  parentId: z.uuid("Lokasi induk tidak valid.").nullable(),
  active: z.boolean(),
})

export const warehouseLocationChangesSchema = z
  .object({
    rows: z.array(warehouseLocationRowSchema).max(1000, "Maksimal 1.000 lokasi per penyimpanan."),
    deletedIds: z.array(z.uuid()).max(1000),
  })
  .superRefine(({ rows, deletedIds }, ctx) => {
    const ids = rows.map((row) => row.id)
    if (
      new Set(ids).size !== ids.length ||
      new Set(deletedIds).size !== deletedIds.length ||
      ids.some((id) => deletedIds.includes(id))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Identitas baris lokasi tidak boleh berulang atau sekaligus dihapus.",
      })
    }
    const codes = rows.map((row) => row.code)
    if (new Set(codes).size !== codes.length) {
      ctx.addIssue({ code: "custom", message: "Kode lokasi tidak boleh sama dalam satu gudang." })
    }
  })

export type WarehouseLocationDraft = z.infer<typeof warehouseLocationRowSchema>
export type WarehouseLocationChanges = z.infer<typeof warehouseLocationChangesSchema>

// Tidak dikirim = pemanggil lama hanya mengubah data gudang, bukan lokasi.
export const warehouseLocationFormSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined
    try {
      const parsed = warehouseLocationChangesSchema.safeParse(JSON.parse(value))
      if (parsed.success) return parsed.data
      for (const issue of parsed.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message })
    } catch {
      ctx.addIssue({ code: "custom", message: "Data baris lokasi tidak valid." })
    }
    return z.NEVER
  })
