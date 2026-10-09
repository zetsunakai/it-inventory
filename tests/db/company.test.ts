import { and, desc, eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { saveCompanyProfile } from "@/app/(app)/master/perusahaan/actions"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, company, refCodes } from "@/server/db/schema"
import { getCompanyProfile } from "@/server/queries/company"

import { inRollback, pgErrorMessage } from "./helpers"

// Profil perusahaan (backlog M1-02): satu baris, format nomor resmi di database,
// hanya Administrator yang bisa menyimpan.

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

const FORM = {
  name: "PT Uji Berikat",
  address: "Jl. Industri No. 1, Bekasi",
  npwp: "01.234.567.8-901.000",
  nitku: "",
  nib: "1234567890123",
  facilityType: "kawasan_berikat",
  permitNumber: "KEP-123/WBC.08/2024",
  permitDate: "2024-03-15",
  supervisingOfficeCode: "ZQC100",
}

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [name, value] of Object.entries(values)) data.set(name, value)
  return data
}

beforeAll(async () => {
  await db.insert(refCodes).values([
    { type: "customs_office", code: "ZQC100", name: "KPPBC Uji Pengawas" },
    { type: "customs_office", code: "ZQC200", name: "KPPBC Uji Lain" },
    { type: "customs_office", code: "ZQC900", name: "KPPBC Uji Lama", active: false },
  ])
})

afterAll(async () => {
  await db.delete(company)
  await db.delete(refCodes).where(like(refCodes.code, "ZQC%"))
  await db.$client.end()
})

beforeEach(async () => {
  await db.delete(company)
  loginAs(["administrator"])
})

describe("tabel company", () => {
  test("hanya boleh satu baris", async () => {
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.execute(sql`
          insert into company (id, name, address, npwp, nitku, nib, facility_type, permit_number,
            permit_date, supervising_office_code)
          values (false, 'X', 'X', '0012345678901000', '0012345678901000000000', '1234567890123',
            'kawasan_berikat', 'X', '2024-01-01', 'ZQC100')`),
      )
      expect(message).toContain("company_single_row")
    })
  })

  test("format NPWP, NITKU, dan NIB dipaksakan di database", async () => {
    const row = {
      name: "X",
      address: "X",
      npwp: "0012345678901000",
      nitku: "0012345678901000000000",
      nib: "1234567890123",
      facilityType: "kawasan_berikat" as const,
      permitNumber: "X",
      permitDate: "2024-01-01",
      supervisingOfficeCode: "ZQC100",
    }
    for (const [field, value, constraint] of [
      // NPWP salah otomatis juga melanggar "NITKU diawali NPWP"; Postgres melaporkan salah satunya.
      ["npwp", "12.345", "company_(npwp|nitku)_format"],
      ["nitku", "9999999999999999000000", "company_nitku_format"],
      ["nib", "123", "company_nib_format"],
    ] as const) {
      await inRollback(db, async (tx) => {
        const message = await pgErrorMessage(tx.insert(company).values({ ...row, [field]: value }))
        expect(message).toMatch(new RegExp(constraint))
      })
    }
  })
})

describe("saveCompanyProfile", () => {
  test("Administrator mengisi lalu memperbarui profil; tetap satu baris dan tercatat di audit", async () => {
    const user = loginAs(["administrator"])

    const created = await saveCompanyProfile(null, form(FORM))
    expect(created).toEqual({ ok: true, data: undefined, message: "Profil perusahaan disimpan." })

    const updated = await saveCompanyProfile(
      null,
      form({ ...FORM, name: "PT Uji Berikat Baru", supervisingOfficeCode: "ZQC200" }),
    )
    expect(updated.ok).toBe(true)

    const rows = await db.select().from(company)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "PT Uji Berikat Baru",
      npwp: "0012345678901000",
      nitku: "0012345678901000000000",
      supervisingOfficeCode: "ZQC200",
    })

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "company"), eq(auditLogs.userId, user.id)))
      .orderBy(desc(auditLogs.id))
    expect(logs.map((log) => log.action)).toEqual(["UPDATE", "INSERT"])
  })

  test("profil dibaca bersama kantor pengawas untuk ditampilkan sebagai [kode] nama", async () => {
    await saveCompanyProfile(null, form(FORM))

    const profile = await getCompanyProfile()
    expect(profile?.office).toEqual({
      code: "ZQC100",
      name: "KPPBC Uji Pengawas",
      parentCode: null,
    })
  })

  test("hanya Administrator yang boleh menyimpan", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const result = await saveCompanyProfile(null, form(FORM))
      expect(result).toMatchObject({
        ok: false,
        errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
      })
    }
    expect(await db.select().from(company)).toHaveLength(0)
  })

  test("kantor pabean harus ada dan aktif", async () => {
    for (const code of ["ZQC777", "ZQC900"]) {
      const result = await saveCompanyProfile(null, form({ ...FORM, supervisingOfficeCode: code }))
      expect(result).toMatchObject({
        ok: false,
        errors: [`Kantor pabean dengan kode ${code} tidak ditemukan.`],
      })
    }
  })

  test("kantor yang sudah tersimpan tetap boleh dipakai walau kemudian diarsipkan", async () => {
    await saveCompanyProfile(null, form(FORM))
    await db.update(refCodes).set({ active: false }).where(eq(refCodes.code, "ZQC100"))
    try {
      const result = await saveCompanyProfile(null, form({ ...FORM, name: "PT Nama Baru" }))
      expect(result.ok).toBe(true)
    } finally {
      await db.update(refCodes).set({ active: true }).where(eq(refCodes.code, "ZQC100"))
    }
  })
})
