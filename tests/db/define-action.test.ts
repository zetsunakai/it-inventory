import { and, desc, eq, sql } from "drizzle-orm"
import { refresh } from "next/cache"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

import { updateSetting } from "@/app/admin/pengaturan/actions"
import type { Role } from "@/lib/permissions"
import { AppError, defineAction } from "@/server/actions/define-action"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, systemSettings } from "@/server/db/schema"

// Pola mutasi standar (backlog M0-08) dijalankan terhadap database tes sungguhan.
// Hanya sesi login dan refresh UI yang dipalsukan.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

afterAll(() => db.$client.end())

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "User Tes",
    email: "tes@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
  return session.user
}

// Setiap tes memakai key pengaturan sendiri supaya tidak saling memengaruhi.
async function createSetting(value = "awal") {
  const key = `tes.${crypto.randomUUID()}`
  await db.insert(systemSettings).values({ key, value })
  return key
}

async function settingValue(key: string) {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
  return row?.value
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeEach(() => {
  vi.mocked(refresh).mockClear()
  loginAs(["administrator"])
})

describe("defineFormAction (contoh: updateSetting)", () => {
  test("berhasil: data berubah, pelaku tercatat di audit log, UI di-refresh", async () => {
    const user = loginAs(["administrator"])
    const key = await createSetting()

    const result = await updateSetting(null, form({ key, value: "baru" }))

    expect(result).toEqual({ ok: true, data: undefined, message: "Pengaturan disimpan." })
    expect(await settingValue(key)).toBe("baru")
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "system_settings"), eq(auditLogs.recordId, key)))
      .orderBy(desc(auditLogs.id))
      .limit(1)
    expect(log).toMatchObject({ action: "UPDATE", userId: user.id })
    expect(refresh).toHaveBeenCalledOnce()
  })

  test("peran tanpa izin ditolak sebelum menyentuh database", async () => {
    loginAs(["auditor"])
    const key = await createSetting()

    const result = await updateSetting(null, form({ key, value: "baru" }))

    expect(result).toEqual({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
    expect(await settingValue(key)).toBe("awal")
  })

  test("input tidak valid mengembalikan semua kesalahan per field", async () => {
    const result = await updateSetting(null, form({ key: "", value: "   " }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toHaveLength(2)
    expect(result.errors).toContain("Nilai wajib diisi.")
    expect(result.fieldErrors).toMatchObject({
      key: [expect.any(String)],
      value: ["Nilai wajib diisi."],
    })
  })

  test("AppError dari handler ditampilkan ke user", async () => {
    const result = await updateSetting(null, form({ key: "tidak.ada", value: "baru" }))

    expect(result).toEqual({ ok: false, errors: ['Pengaturan "tidak.ada" tidak ditemukan.'] })
  })
})

describe("defineAction", () => {
  const permission = "settings:write" as const

  test("perubahan di-rollback bila handler gagal", async () => {
    const key = await createSetting()
    const action = defineAction({
      name: "tesRollback",
      permission,
      schema: z.object({ key: z.string() }),
      handler: async ({ input, tx }) => {
        await tx
          .update(systemSettings)
          .set({ value: "berubah" })
          .where(eq(systemSettings.key, input.key))
        throw new AppError(["Alasan pertama.", "Alasan kedua."])
      },
    })

    const result = await action({ key })

    expect(result).toEqual({ ok: false, errors: ["Alasan pertama.", "Alasan kedua."] })
    expect(await settingValue(key)).toBe("awal")
    expect(refresh).not.toHaveBeenCalled()
  })

  test("RAISE EXCEPTION dari fungsi database dipecah jadi satu alasan per baris", async () => {
    const action = defineAction({
      name: "tesRaise",
      permission,
      schema: z.object({}),
      handler: async ({ tx }) => {
        await tx.execute(
          sql.raw(
            "do $$ begin raise exception E'Stok produk A tidak cukup.\\nDokumen BC belum Terdaftar.'; end $$",
          ),
        )
      },
    })

    const result = await action({})

    expect(result).toEqual({
      ok: false,
      errors: ["Stok produk A tidak cukup.", "Dokumen BC belum Terdaftar."],
    })
  })

  test("pelanggaran unique diterjemahkan jadi pesan yang bisa dibaca", async () => {
    const key = await createSetting()
    const action = defineAction({
      name: "tesUnique",
      permission,
      schema: z.object({ key: z.string() }),
      handler: async ({ input, tx }) => {
        await tx.insert(systemSettings).values({ key: input.key, value: "duplikat" })
      },
    })

    const result = await action({ key })

    expect(result).toEqual({ ok: false, errors: ["Data dengan nilai yang sama sudah ada."] })
  })

  test("error tak terduga tidak membocorkan detail ke user", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const action = defineAction({
      name: "tesTakTerduga",
      permission,
      schema: z.object({}),
      handler: async () => {
        throw new Error("detail internal")
      },
    })

    const result = await action({})

    expect(result).toEqual({
      ok: false,
      errors: ["Terjadi kesalahan sistem. Coba lagi atau hubungi Administrator."],
    })
    expect(consoleError).toHaveBeenCalledOnce()
    consoleError.mockRestore()
  })
})
