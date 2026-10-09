import { inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { parseListParams } from "@/lib/list-params"
import type { Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { userRoles, users } from "@/server/db/schema"
import { listUsers } from "@/server/queries/users"

// Query halaman Pengguna (contoh tabel data M0-09): cari, filter peran, pagination di server.
// listUsers memakai koneksi aplikasi, jadi datanya di-commit lalu dihapus setelah tes.

const DOMAIN = `daftar-${crypto.randomUUID().slice(0, 8)}.test`
const createdIds: string[] = []

async function createUser(name: string, roles: Role[], email = `${slug(name)}@${DOMAIN}`) {
  const [user] = await db
    .insert(users)
    .values({ name, email, emailVerified: true })
    .returning({ id: users.id })
  createdIds.push(user.id)
  if (roles.length) {
    await db.insert(userRoles).values(roles.map((role) => ({ userId: user.id, role })))
  }
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
}

function list(query: Record<string, string>, role?: Role) {
  return listUsers({ ...parseListParams(query, { pageSize: 10 }), role })
}

beforeAll(async () => {
  // 12 user: nama berurutan supaya urutan hasil bisa diperiksa.
  for (let index = 1; index <= 12; index++) {
    const number = String(index).padStart(2, "0")
    const roles: Role[] = index <= 3 ? ["manajer"] : index === 4 ? [] : ["admin_gudang"]
    await createUser(`Uji Daftar ${number}`, roles)
  }
  await createUser("Uji Ganda", ["staf_exim", "admin_gudang"])
  await createUser("Uji_Bergaris", ["auditor"], `bergaris@${DOMAIN}`)
})

afterAll(async () => {
  await db.delete(users).where(inArray(users.id, createdIds))
  await db.$client.end()
})

describe("listUsers", () => {
  test("pagination: total dihitung dari semua hasil, baris dipotong per halaman", async () => {
    const first = await list({ q: DOMAIN })
    const second = await list({ q: DOMAIN, page: "2" })

    expect(first.total).toBe(14)
    expect(first.rows).toHaveLength(10)
    expect(second.rows).toHaveLength(4)
    expect(first.rows[0].name).toBe("Uji Daftar 01")
    expect(second.rows.map((row) => row.name)).toEqual([
      "Uji Daftar 11",
      "Uji Daftar 12",
      "Uji Ganda",
      "Uji_Bergaris",
    ])
  })

  test("pencarian di nama dan email, tidak peka huruf besar/kecil", async () => {
    const byName = await list({ q: "uji daftar 07" })
    expect(byName.rows.map((row) => row.name)).toEqual(["Uji Daftar 07"])

    const byEmail = await list({ q: `BERGARIS@${DOMAIN.toUpperCase()}` })
    expect(byEmail.rows.map((row) => row.name)).toEqual(["Uji_Bergaris"])
  })

  test("filter peran", async () => {
    const result = await list({ q: DOMAIN }, "manajer")

    expect(result.total).toBe(3)
    expect(result.rows.every((row) => row.roles.includes("manajer"))).toBe(true)
  })

  test("peran digabung per user dan diurutkan; user tanpa peran mendapat daftar kosong", async () => {
    const ganda = await list({ q: "uji ganda" })
    // Urutan mengikuti urutan nilai enum app_role.
    expect(ganda.rows[0].roles).toEqual(["staf_exim", "admin_gudang"])

    const withoutRole = await list({ q: "uji daftar 04" })
    expect(withoutRole.rows[0].roles).toEqual([])
  })

  test("_ dan % dari input dicari apa adanya, bukan sebagai wildcard", async () => {
    const underscore = await list({ q: "_" })
    expect(underscore.rows.map((row) => row.name)).toEqual(["Uji_Bergaris"])

    const percent = await list({ q: "%" })
    expect(percent.total).toBe(0)
  })
})
