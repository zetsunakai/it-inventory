import { jsonb, pgTable, text } from "drizzle-orm/pg-core"

import { timestamps } from "./_columns"

// Pengaturan aplikasi berbentuk key-value, misalnya zona waktu
// dan nanti format nomor aju (PRD bagian 7.4).
export const systemSettings = pgTable("system_settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  description: text(),
  ...timestamps,
})
