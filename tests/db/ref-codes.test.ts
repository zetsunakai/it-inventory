import { and, desc, eq, like } from "drizzle-orm"
import { refresh } from "next/cache"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { createRefCode, updateRefCode } from "@/app/(app)/master/referensi/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, refCodes } from "@/server/db/schema"
import { searchRefCodes } from "@/server/queries/ref-codes"

import { inRollback, pgErrorMessage } from "./helpers"

// Referensi kepabeanan (backlog M1-01): aturan di database, pencarian [kode] nama,
// dan aksi tambah/ubah yang hanya untuk Administrator.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

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

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

// Data uji memakai kode berawalan ZQ supaya tidak bentrok dengan data lain,
// dan dihapus lagi setelah tes.
async function insert(values: typeof refCodes.$inferInsert) {
  const [row] = await db.insert(refCodes).values(values).returning()
  return row
}

beforeAll(async () => {
  await insert({ type: "customs_office", code: "ZQ0100", name: "KPPBC Uji Satu" })
  await insert({ type: "customs_office", code: "ZQ0200", name: "KPPBC Uji Dua" })
  await insert({ type: "customs_office", code: "ZQ9", name: "Kantor ZQ0100 lama", active: false })
  await insert({ type: "tps", code: "ZQT1", name: "TPS Satu", parentCode: "ZQ0100" })
  await insert({ type: "tps", code: "ZQT1", name: "TPS Satu di kantor lain", parentCode: "ZQ0200" })
})

afterAll(async () => {
  await db.delete(refCodes).where(like(refCodes.code, "ZQ%"))
  await db.$client.end()
})

beforeEach(() => {
  vi.mocked(refresh).mockClear()
  loginAs(["administrator"])
})

describe("aturan tabel ref_codes", () => {
  test("kode unik per jenis; jenis tanpa induk tetap unik walau parent_code kosong", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(refCodes).values({ type: "country", code: "ZQ", name: "Negara Uji" })
      const message = await pgErrorMessage(
        tx.insert(refCodes).values({ type: "country", code: "ZQ", name: "Ganda" }),
      )
      expect(message).toContain("ref_codes_type_parent_code_code_key")
    })
  })

  test("kode TPS boleh sama di kantor pabean yang berbeda", async () => {
    const rows = await db.select().from(refCodes).where(eq(refCodes.code, "ZQT1"))
    expect(rows.map((row) => row.parentCode).sort()).toEqual(["ZQ0100", "ZQ0200"])
  })

  test("parent_code wajib untuk TPS dan pelabuhan luar negeri, dilarang untuk jenis lain", async () => {
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.insert(refCodes).values({ type: "tps", code: "ZQX", name: "Tanpa kantor" }),
      )
      expect(message).toContain("ref_codes_parent_code_by_type")
    })
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.insert(refCodes).values({ type: "currency", code: "ZQX", name: "X", parentCode: "ID" }),
      )
      expect(message).toContain("ref_codes_parent_code_by_type")
    })
  })

  test("kode dan nama tidak boleh hanya spasi", async () => {
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.insert(refCodes).values({ type: "incoterm", code: "  ", name: "Kosong" }),
      )
      expect(message).toContain("ref_codes_code_not_blank")
    })
  })
})

describe("searchRefCodes", () => {
  test("kode yang sama persis tampil paling atas, lalu awalan kode, lalu nama", async () => {
    const result = await searchRefCodes({ type: "customs_office", search: "zq0100" })
    // ZQ9 diarsipkan, jadi tidak muncul walaupun namanya mengandung ZQ0100.
    expect(result.map((row) => row.code)).toEqual(["ZQ0100"])

    const prefix = await searchRefCodes({ type: "customs_office", search: "ZQ0" })
    expect(prefix.map((row) => row.code)).toEqual(["ZQ0100", "ZQ0200"])

    const byName = await searchRefCodes({ type: "customs_office", search: "uji dua" })
    expect(byName).toEqual([{ code: "ZQ0200", name: "KPPBC Uji Dua", parentCode: null }])
  })

  test("pilihan bisa dibatasi ke satu induk", async () => {
    const result = await searchRefCodes({ type: "tps", search: "ZQT1", parentCode: "ZQ0200" })
    expect(result).toEqual([
      { code: "ZQT1", name: "TPS Satu di kantor lain", parentCode: "ZQ0200" },
    ])
  })
})

describe("createRefCode", () => {
  test("Administrator menambah TPS; tercatat di audit log dengan pelakunya", async () => {
    const user = loginAs(["administrator"])
    const result = await createRefCode(
      null,
      form({ type: "tps", code: "ZQT2", name: " TPS Baru ", parentCode: "ZQ0100" }),
    )

    expect(result).toMatchObject({ ok: true, data: { type: "tps", code: "ZQT2" } })
    const [row] = await db
      .select()
      .from(refCodes)
      .where(and(eq(refCodes.code, "ZQT2"), eq(refCodes.parentCode, "ZQ0100")))
    expect(row).toMatchObject({ name: "TPS Baru", active: true })
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "ref_codes"), eq(auditLogs.recordId, row.id)))
      .orderBy(desc(auditLogs.id))
    expect(log).toMatchObject({ action: "INSERT", userId: user.id })
  })

  test("peran selain Administrator ditolak, termasuk Manajer", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const result = await createRefCode(
        null,
        form({ type: "incoterm", code: "ZQI", name: "Tidak boleh" }),
      )
      expect(result).toMatchObject({
        ok: false,
        errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
      })
    }
  })

  test("semua kesalahan input dikembalikan sekaligus", async () => {
    const result = await createRefCode(null, form({ type: "tps", code: "", name: "" }))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "Kode wajib diisi.",
        "Nama wajib diisi.",
        "Kantor pabean wajib dipilih untuk TPS.",
      ]),
    )
  })

  test("induk yang tidak ada dan kode ganda ditolak dengan pesan yang jelas", async () => {
    const missingParent = await createRefCode(
      null,
      form({ type: "tps", code: "ZQT3", name: "X", parentCode: "ZQ7777" }),
    )
    expect(missingParent).toMatchObject({
      ok: false,
      errors: ["Kantor pabean dengan kode ZQ7777 tidak ditemukan."],
    })

    const duplicate = await createRefCode(
      null,
      form({ type: "tps", code: "ZQT1", name: "X", parentCode: "ZQ0100" }),
    )
    expect(duplicate).toMatchObject({
      ok: false,
      errors: ["Kode ZQT1 sudah ada di TPS untuk Kantor pabean ZQ0100."],
    })
  })
})

describe("updateRefCode", () => {
  test("mengubah nama dan mengarsipkan; checkbox kosong berarti arsip", async () => {
    const row = await insert({ type: "customs_office", code: "ZQ0300", name: "Lama" })

    const archived = await updateRefCode(null, form({ id: row.id, name: "Baru" }))
    expect(archived).toEqual({ ok: true, data: undefined, message: "Perubahan disimpan." })
    const [after] = await db.select().from(refCodes).where(eq(refCodes.id, row.id))
    expect(after).toMatchObject({ name: "Baru", active: false, code: "ZQ0300" })

    await updateRefCode(null, form({ id: row.id, name: "Baru", active: "on" }))
    const [reactivated] = await db.select().from(refCodes).where(eq(refCodes.id, row.id))
    expect(reactivated.active).toBe(true)
  })

  test("Manajer tidak boleh mengubah", async () => {
    const row = await insert({ type: "customs_office", code: "ZQ0400", name: "Tetap" })
    loginAs(["manajer"])

    const result = await updateRefCode(null, form({ id: row.id, name: "Diubah", active: "on" }))

    expect(result.ok).toBe(false)
    const [after] = await db.select().from(refCodes).where(eq(refCodes.id, row.id))
    expect(after.name).toBe("Tetap")
  })
})
