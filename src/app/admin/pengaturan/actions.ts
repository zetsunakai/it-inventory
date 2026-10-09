"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { AppError, defineFormAction } from "@/server/actions/define-action"
import { systemSettings } from "@/server/db/schema"

// Contoh pemakaian pola mutasi standar (M0-08).
export const updateSetting = defineFormAction({
  name: "updateSetting",
  permission: "settings:write",
  schema: z.object({
    key: z.string().min(1),
    value: z.string().trim().min(1, "Nilai wajib diisi."),
  }),
  successMessage: "Pengaturan disimpan.",
  handler: async ({ input, tx }) => {
    const [row] = await tx
      .update(systemSettings)
      .set({ value: input.value })
      .where(eq(systemSettings.key, input.key))
      .returning({ key: systemSettings.key })
    if (!row) throw new AppError(`Pengaturan "${input.key}" tidak ditemukan.`)
  },
})
