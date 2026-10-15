import { eq, sql } from "drizzle-orm"
import { afterAll, expect, test } from "vitest"

import { db } from "@/server/db"
import { partners } from "@/server/db/schema"
import { recordActivity } from "@/server/queries/activity"

// Log aktivitas dokumen dari audit_logs (backlog RU-23). Data uji berawalan ZAC.

const LABELS = {
  fields: { name: "Nama", address: "Alamat", active: "Aktif", country_code: "Negara" },
}

let id = ""

afterAll(async () => {
  if (id) await db.delete(partners).where(eq(partners.id, id))
  await db.$client.end()
})

test("dibuat lalu diubah: perubahan per field dengan label, perubahan kolom teknis disembunyikan", async () => {
  const [row] = await db
    .insert(partners)
    .values({
      code: "ZAC1",
      name: "Mitra lama",
      address: "Bekasi",
      countryCode: "ID",
      isVendor: true,
      isCustomer: false,
      identityType: "other",
      identityNumber: "ZAC1",
    })
    .returning({ id: partners.id })
  id = row.id
  await db.update(partners).set({ name: "Mitra baru", active: false }).where(eq(partners.id, id))
  // Hanya updated_at: tidak tampil di log.
  await db.execute(sql`update partners set updated_at = now() where id = ${id}`)

  const entries = await recordActivity("partners", id, LABELS)
  expect(entries.map((entry) => entry.action)).toEqual(["UPDATE", "INSERT"])
  expect(entries[0].changes).toEqual([
    { field: "Nama", from: "Mitra lama", to: "Mitra baru" },
    { field: "Aktif", from: "Ya", to: "Tidak" },
  ])
})
