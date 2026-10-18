import { and, eq, sql } from "drizzle-orm"
import { afterAll, expect, test } from "vitest"

import { db } from "@/server/db"
import { partners, systemSettings, userRoles, users } from "@/server/db/schema"
import {
  childActivity,
  mergeActivity,
  recordActivity,
  tableActivity,
} from "@/server/queries/activity"

// Log aktivitas dokumen dari audit_logs (backlog RU-23). Data uji berawalan ZAC.

const LABELS = {
  fields: { name: "Nama", address: "Alamat", active: "Aktif", country_code: "Negara" },
}

let id = ""

let userId = ""

afterAll(async () => {
  if (id) await db.delete(partners).where(eq(partners.id, id))
  if (userId) await db.delete(users).where(eq(users.id, userId))
  await db.delete(systemSettings).where(eq(systemSettings.key, "zac.uji"))
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

test("baris anak (peran) tampil sebagai perubahan record induk, digabung terbaru dulu", async () => {
  const [user] = await db
    .insert(users)
    .values({ name: "ZAC User", email: "zac@activity.test", emailVerified: true })
    .returning({ id: users.id })
  userId = user.id
  await db.insert(userRoles).values({ userId, role: "staf_exim" })
  await db.insert(userRoles).values({ userId, role: "auditor" })
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "staf_exim")))

  const roles = await childActivity("user_roles", userId, "Peran", (data) => String(data.role))
  expect(roles.map((entry) => entry.changes[0])).toEqual([
    { field: "Peran", from: "staf_exim", to: "dihapus" },
    { field: "Peran", from: null, to: "+ auditor" },
    { field: "Peran", from: null, to: "+ staf_exim" },
  ])
  const merged = mergeActivity(await recordActivity("users", userId, { fields: {} }), roles)
  expect(merged.map((entry) => entry.action)).toEqual(["UPDATE", "UPDATE", "UPDATE", "INSERT"])
})

test("riwayat tabel kecil: perubahan nilai per record dengan label record", async () => {
  await db.insert(systemSettings).values({ key: "zac.uji", value: "satu", description: "Uji" })
  await db.update(systemSettings).set({ value: "dua" }).where(eq(systemSettings.key, "zac.uji"))
  const entries = (await tableActivity("system_settings", "value", (key) => `Label ${key}`)).filter(
    (entry) => entry.changes[0].field === "Label zac.uji",
  )
  expect(entries.map((entry) => entry.changes[0])).toEqual([
    { field: "Label zac.uji", from: "satu", to: "dua" },
    { field: "Label zac.uji", from: null, to: "satu" },
  ])
})
