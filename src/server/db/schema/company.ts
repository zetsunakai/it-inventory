import { boolean, date, pgEnum, pgTable, text } from "drizzle-orm/pg-core"

// Path relatif (bukan alias @/) karena schema juga dibaca oleh drizzle-kit dan script CLI.
import { FACILITY_TYPES } from "../../../lib/company"

import { timestamps } from "./_columns"

export const facilityType = pgEnum("facility_type", FACILITY_TYPES)

// Profil perusahaan penerima fasilitas (PRD bagian 5.1), satu baris saja: primary key
// selalu true (dipaksa CHECK di migrasi). Dipakai sebagai entitas Pengusaha/Pemilik
// di dokumen BC. NPWP disimpan 16 digit, NITKU 22 digit, NIB 13 digit, hanya angka.
export const company = pgTable("company", {
  id: boolean().primaryKey().default(true),
  name: text().notNull(),
  address: text().notNull(),
  npwp: text().notNull(),
  nitku: text().notNull(),
  nib: text().notNull(),
  facilityType: facilityType().notNull(),
  permitNumber: text().notNull(),
  permitDate: date({ mode: "string" }).notNull(),
  // Kode ref_codes jenis customs_office.
  supervisingOfficeCode: text().notNull(),
  ...timestamps,
})
