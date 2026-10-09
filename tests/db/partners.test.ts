import { and, desc, eq, like } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { createPartner, updatePartner } from "@/app/(app)/master/partner/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, partners, refCodes } from "@/server/db/schema"
import { listPartners } from "@/server/queries/partners"

import { inRollback, pgErrorMessage } from "./helpers"

// Partner (backlog M1-06).

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

const VENDOR = {
  name: "PT Pemasok Uji",
  address: "Bekasi",
  countryCode: "ZQ",
  isVendor: "on",
  identityType: "npwp15",
  identityNumber: "01.234.567.8-901.000",
}

beforeAll(async () => {
  await db.insert(refCodes).values({ type: "country", code: "ZQ", name: "Negara uji" })
})

afterAll(async () => {
  await db.delete(partners).where(like(partners.code, "ZQ%"))
  await db.delete(refCodes).where(and(eq(refCodes.type, "country"), eq(refCodes.code, "ZQ")))
  await db.$client.end()
})

beforeEach(() => loginAs(["administrator"]))

const ROW = {
  code: "ZQX",
  name: "X",
  address: "X",
  countryCode: "ZQ",
  isVendor: true,
  isCustomer: false,
  identityType: "npwp16" as const,
  identityNumber: "1234567890123456",
  nitku: "1234567890123456000000",
}

describe("aturan tabel partner", () => {
  test("NITKU harus konsisten dengan NPWP, dan kosong untuk identitas lain", async () => {
    for (const [values, constraint] of [
      [{ nitku: "9999999999999999000000" }, "partners_nitku_by_identity"],
      [{ nitku: null }, "partners_nitku_by_identity"],
      [
        {
          identityType: "npwp15" as const,
          identityNumber: "123456789012345",
          nitku: "1234567890123450000000",
        },
        "partners_nitku_by_identity",
      ],
      [
        { identityType: "passport" as const, identityNumber: "A1234567", nitku: "1" },
        "partners_nitku_by_identity",
      ],
      [
        { identityType: "ktp" as const, identityNumber: "123", nitku: null },
        "partners_identity_number_format",
      ],
      [{ isVendor: false }, "partners_has_role"],
    ] as const) {
      await inRollback(db, async (tx) => {
        const message = await pgErrorMessage(tx.insert(partners).values({ ...ROW, ...values }))
        expect(message).toContain(constraint)
      })
    }
  })

  test("NPWP 15 digit: NITKU diawali 0 + NPWP diterima database", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(partners).values({
        ...ROW,
        identityType: "npwp15",
        identityNumber: "123456789012345",
        nitku: "0123456789012345000000",
      })
    })
  })

  test("kode partner tidak bisa diubah", async () => {
    await inRollback(db, async (tx) => {
      const [row] = await tx.insert(partners).values(ROW).returning()
      expect(
        await pgErrorMessage(
          tx.update(partners).set({ code: "ZQBARU" }).where(eq(partners.id, row.id)),
        ),
      ).toContain("Kode partner tidak bisa diubah.")
    })
  })
})

describe("aksi partner", () => {
  test("NPWP 15 digit menghasilkan NITKU 0 + NPWP + 000000; tercatat di audit", async () => {
    const admin = loginAs(["administrator"])
    const result = await createPartner(null, form({ ...VENDOR, code: "ZQV1" }))
    expect(result).toMatchObject({ ok: true, data: { code: "ZQV1" } })

    const [row] = await db.select().from(partners).where(eq(partners.code, "ZQV1"))
    expect(row).toMatchObject({
      identityNumber: "012345678901000",
      nitku: "0012345678901000000000",
      isVendor: true,
      isCustomer: false,
    })
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "partners"), eq(auditLogs.recordId, row.id)))
      .orderBy(desc(auditLogs.id))
    expect(log).toMatchObject({ action: "INSERT", userId: admin.id })
  })

  test("NITKU yang sama tidak boleh dipakai dua partner; cabang dengan NITKU lain boleh", async () => {
    const duplicate = await createPartner(null, form({ ...VENDOR, code: "ZQV2" }))
    expect(duplicate).toMatchObject({
      ok: false,
      errors: ["NITKU 0012345678901000000000 sudah dipakai partner ZQV1."],
    })

    const branch = await createPartner(
      null,
      form({ ...VENDOR, code: "ZQV2", nitku: "0012345678901000000001" }),
    )
    expect(branch).toMatchObject({ ok: true })
  })

  test("negara harus ada di referensi; kode partner unik", async () => {
    const result = await createPartner(
      null,
      form({
        ...VENDOR,
        code: "ZQV1",
        countryCode: "XX",
        identityType: "passport",
        identityNumber: "E1234567",
      }),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: ["Kode partner ZQV1 sudah dipakai.", "Negara dengan kode XX tidak ditemukan."],
    })
  })

  test("mengubah partner jadi customer juga; NITKU tetap milik partner sendiri", async () => {
    const [row] = await db.select().from(partners).where(eq(partners.code, "ZQV1"))
    const result = await updatePartner(
      null,
      form({ ...VENDOR, id: row.id, isCustomer: "on", active: "on" }),
    )
    expect(result).toMatchObject({ ok: true })

    const customers = await listPartners({
      search: "ZQV",
      role: "customer",
      page: 1,
      pageSize: 20,
      offset: 0,
    })
    expect(customers.rows.map((partner) => partner.code)).toEqual(["ZQV1"])
  })

  test("peran selain Administrator tidak bisa menambah partner", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const result = await createPartner(
        null,
        form({ ...VENDOR, code: "ZQNO", identityType: "passport", identityNumber: "E7654321" }),
      )
      expect(result.ok).toBe(false)
    }
  })
})
