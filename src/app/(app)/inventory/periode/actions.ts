"use server"

import { sql } from "drizzle-orm"
import { z } from "zod"

import { defineAction } from "@/server/actions/define-action"

// Tutup periode bulanan (backlog M2-10): hanya Manajer (izin inventory:approve). Urutan
// penutupan, perhitungan period_balances, dan penguncian ada di close_period() (migrasi
// period_rules).
export const closePeriod = defineAction({
  name: "closePeriod",
  permission: "inventory:approve",
  schema: z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
  }),
  successMessage: "Periode ditutup. Saldo akhir bulan sudah disimpan.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select close_period(${input.year}, ${input.month})`)
  },
})
