import { eq } from "drizzle-orm"
import { afterAll, beforeEach, expect, test, vi } from "vitest"

import {
  connectCeisa,
  revealCeisaPassword,
  saveCeisaCredentials,
} from "@/modules/it-inventory/actions/ceisa"
import { decryptToken } from "@/modules/it-inventory/server/ceisa/token-crypto"
import { readStoredCeisaConfig } from "@/modules/it-inventory/server/ceisa/settings"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, ceisaConnections, systemSettings } from "@/server/db/schema"

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

beforeEach(async () => {
  await db
    .update(systemSettings)
    .set({ value: "development" })
    .where(eq(systemSettings.key, "ceisa.environment"))
  vi.stubEnv("CEISA_TOKEN_KEY", Buffer.alloc(32, 9).toString("base64"))
  await db.delete(ceisaConnections).where(eq(ceisaConnections.environment, "development"))
  session.user = {
    id: crypto.randomUUID(),
    name: "Admin tes",
    email: "ceisa@tes.local",
    roles: ["administrator"],
    twoFactorEnabled: true,
  }
})

afterAll(async () => {
  await db
    .update(systemSettings)
    .set({ value: "production" })
    .where(eq(systemSettings.key, "ceisa.environment"))
  await db.delete(ceisaConnections).where(eq(ceisaConnections.environment, "development"))
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await db.$client.end()
})

test("password terenkripsi, tidak dikembalikan atau dicatat di audit; kosong mempertahankan password", async () => {
  const input = { username: "akun-tes", password: "password-sangat-rahasia" }
  const result = await saveCeisaCredentials(input)
  expect(result.ok).toBe(true)
  expect(JSON.stringify(result)).not.toContain(input.password)
  const [row] = await db
    .select()
    .from(ceisaConnections)
    .where(eq(ceisaConnections.environment, "development"))
  expect(row.passwordEnc).not.toContain(input.password)
  expect(decryptToken(row.passwordEnc!)).toBe(input.password)
  expect(await revealCeisaPassword({})).toMatchObject({
    ok: true,
    data: { password: input.password },
  })
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.userId, session.user!.id))
  expect(logs.length).toBeGreaterThan(0)
  expect(JSON.stringify(logs)).not.toContain(input.password)
  expect(JSON.stringify(logs)).not.toContain("password_enc")
  expect((await saveCeisaCredentials({ username: input.username, password: "" })).ok).toBe(true)
  expect((await saveCeisaCredentials({ username: "akun-baru", password: "" })).ok).toBe(false)
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          item: { access_token: "token-tes" },
        }),
        { status: 200 },
      ),
  )
  vi.stubGlobal("fetch", fetchMock)
  expect((await connectCeisa({})).ok).toBe(true)
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual(input)
})

test("auditor tidak dapat menyimpan atau menghubungkan akun", async () => {
  session.user!.roles = ["auditor"]
  expect((await saveCeisaCredentials({ username: "akun", password: "rahasia" })).ok).toBe(false)
  expect((await connectCeisa({})).ok).toBe(false)
  expect((await revealCeisaPassword({})).ok).toBe(false)
})

test("API key opsional, terenkripsi, tidak masuk audit, dan dipertahankan saat kosong", async () => {
  const credentials = { username: "akun-tes", password: "password-tes" }
  expect((await saveCeisaCredentials(credentials)).ok).toBe(true)
  const apiKey = "api-key-sangat-rahasia"
  const result = await saveCeisaCredentials({ ...credentials, apiKey })
  expect(result.ok).toBe(true)
  expect(JSON.stringify(result)).not.toContain(apiKey)
  const [saved] = await db
    .select()
    .from(ceisaConnections)
    .where(eq(ceisaConnections.environment, "development"))
  expect(saved.apiKeyEnc).not.toContain(apiKey)
  expect(decryptToken(saved.apiKeyEnc!)).toBe(apiKey)
  const logs = await db.select().from(auditLogs).where(eq(auditLogs.userId, session.user!.id))
  expect(JSON.stringify(logs)).not.toContain(apiKey)
  expect(JSON.stringify(logs)).not.toContain("api_key_enc")
  expect(
    (await saveCeisaCredentials({ username: credentials.username, password: "", apiKey: "" })).ok,
  ).toBe(true)
  const [unchanged] = await db
    .select()
    .from(ceisaConnections)
    .where(eq(ceisaConnections.environment, "development"))
  expect(unchanged.apiKeyEnc).toBe(saved.apiKeyEnc)
})

test("satu Simpan untuk pengaturan sistem dan CEISA; validasi gagal membatalkan semuanya", async () => {
  const key = "tes.ceisa.form"
  await db.insert(systemSettings).values({ key, value: "awal" })
  try {
    expect(
      (
        await saveCeisaCredentials({
          username: "",
          password: "",
          settings: [{ key, value: "baru" }],
        })
      ).ok,
    ).toBe(true)
    const invalid = await saveCeisaCredentials({
      username: "akun-baru",
      password: "",
      settings: [{ key, value: "jangan-disimpan" }],
    })
    expect(invalid.ok).toBe(false)
    const [row] = await db.select().from(systemSettings).where(eq(systemSettings.key, key))
    expect(row.value).toBe("baru")
    expect(
      (
        await saveCeisaCredentials({
          username: "akun",
          password: "sandi",
          settings: [{ key, value: "bersama" }],
        })
      ).ok,
    ).toBe(true)
    const [saved] = await db.select().from(systemSettings).where(eq(systemSettings.key, key))
    expect(saved.value).toBe("bersama")
  } finally {
    await db.delete(systemSettings).where(eq(systemSettings.key, key))
  }
})

test("lingkungan dibaca dari database, tidak dari env, dan nilai tidak valid ditolak", async () => {
  vi.stubEnv("CEISA_ENV", "production")
  expect(await readStoredCeisaConfig()).toEqual({ environment: "development" })
  expect(
    (
      await saveCeisaCredentials({
        username: "",
        password: "",
        settings: [{ key: "ceisa.environment", value: "production" }],
      })
    ).ok,
  ).toBe(true)
  expect(await readStoredCeisaConfig()).toEqual({ environment: "production" })
  expect(
    (
      await saveCeisaCredentials({
        username: "",
        password: "",
        settings: [{ key: "ceisa.environment", value: "salah" }],
      })
    ).ok,
  ).toBe(false)
  expect(await readStoredCeisaConfig()).toEqual({ environment: "production" })
})
