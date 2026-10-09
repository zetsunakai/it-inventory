import { timestamp } from "drizzle-orm/pg-core"

// Kolom waktu standar untuk setiap tabel (PRD bagian 13.1).
// updated_at diperbarui oleh trigger set_updated_at() di database.
// created_by / updated_by ditambahkan setelah auth tersedia (M0-04).
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}
