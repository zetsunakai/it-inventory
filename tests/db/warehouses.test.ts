import { and, desc, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import {
  createLocation,
  createWarehouse,
  grantWarehouseAccess,
  revokeWarehouseAccess,
  updateLocation,
  updateWarehouse,
} from "@/app/(app)/master/gudang/actions"
import { ALL_WAREHOUSE_ROLES, ROLES, type Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { auditLogs, locations, userRoles, users, warehouses } from "@/server/db/schema"
import { getLocation, listWarehouses, listWarehouseUsers } from "@/server/queries/warehouses"

import { inRollback, pgErrorMessage } from "./helpers"

// Gudang, lokasi, dan akses gudang (backlog M1-03).

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[], id: string = crypto.randomUUID()) {
  session.user = {
    id,
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

// Satu user nyata per peran, untuk menguji can_access_warehouse().
const roleUsers = {} as Record<Role, string>
let gb1: string
let gb2: string

async function createWarehouseRow(code: string) {
  const [row] = await db
    .insert(warehouses)
    .values({
      code,
      name: `Gudang ${code}`,
      address: "Bekasi",
      isBonded: true,
      category: "raw_material",
    })
    .returning({ id: warehouses.id })
  return row.id
}

beforeAll(async () => {
  gb1 = await createWarehouseRow("ZQGB1")
  gb2 = await createWarehouseRow("ZQGB2")
  for (const role of ROLES) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zq-${role}@gudang.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    roleUsers[role] = user.id
  }
})

afterAll(async () => {
  await db.delete(users).where(like(users.email, "zq-%@gudang.test"))
  // Lokasi anak dulu: foreign key induk memakai ON DELETE RESTRICT.
  for (;;) {
    const deleted = await db.execute(sql`
      delete from locations where code like 'ZQ%'
        and id not in (select parent_id from locations where parent_id is not null)`)
    if (!deleted.rowCount) break
  }
  await db.delete(warehouses).where(like(warehouses.code, "ZQ%"))
  await db.$client.end()
})

beforeEach(() => {
  loginAs(["administrator"])
})

describe("aturan lokasi di database", () => {
  test("lokasi internal wajib di dalam gudang; vendor tidak boleh di dalam gudang", async () => {
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.insert(locations).values({ code: "ZQX1", name: "X", type: "internal" }),
      )
      expect(message).toContain("locations_internal_in_warehouse")
    })
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(
        tx.insert(locations).values({ code: "ZQX2", name: "X", type: "vendor", warehouseId: gb1 }),
      )
      expect(message).toContain("locations_virtual_outside_warehouse")
    })
  })

  test("induk harus di gudang yang sama dan tidak boleh membentuk lingkaran", async () => {
    // Satu transaksi per pelanggaran: setelah error, Postgres membatalkan transaksinya.
    const rackAndBin = async (tx: Parameters<Parameters<typeof inRollback>[1]>[0]) => {
      const [rack] = await tx
        .insert(locations)
        .values({ code: "ZQR1", name: "Rak", type: "internal", warehouseId: gb1 })
        .returning()
      const [bin] = await tx
        .insert(locations)
        .values({
          code: "ZQB1",
          name: "Bin",
          type: "internal",
          warehouseId: gb1,
          parentId: rack.id,
        })
        .returning()
      return { rack, bin }
    }

    await inRollback(db, async (tx) => {
      const { rack } = await rackAndBin(tx)
      expect(
        await pgErrorMessage(
          tx.insert(locations).values({
            code: "ZQB2",
            name: "Bin gudang lain",
            type: "internal",
            warehouseId: gb2,
            parentId: rack.id,
          }),
        ),
      ).toContain("Lokasi induk harus berada di gudang yang sama.")
    })

    await inRollback(db, async (tx) => {
      const { rack, bin } = await rackAndBin(tx)
      expect(
        await pgErrorMessage(
          tx.update(locations).set({ parentId: bin.id }).where(eq(locations.id, rack.id)),
        ),
      ).toContain("Lokasi induk tidak boleh berada di bawah lokasi ini sendiri.")
    })
  })

  test("kode, tipe, dan gudang lokasi serta kode gudang tidak bisa diubah", async () => {
    for (const [change, message] of [
      [{ code: "ZQBARU" }, "Kode lokasi tidak bisa diubah."],
      [{ type: "transit" as const }, "Tipe lokasi tidak bisa diubah."],
      [{ warehouseId: gb2 }, "Gudang lokasi tidak bisa diubah."],
    ] as const) {
      await inRollback(db, async (tx) => {
        const [row] = await tx
          .insert(locations)
          .values({ code: "ZQIMM", name: "X", type: "internal", warehouseId: gb1 })
          .returning()
        expect(
          await pgErrorMessage(tx.update(locations).set(change).where(eq(locations.id, row.id))),
        ).toContain(message)
      })
    }
    await inRollback(db, async (tx) => {
      expect(
        await pgErrorMessage(
          tx.update(warehouses).set({ code: "ZQGANTI" }).where(eq(warehouses.id, gb1)),
        ),
      ).toContain("Kode gudang tidak bisa diubah.")
    })
  })
})

describe("can_access_warehouse", () => {
  test("sama dengan ALL_WAREHOUSE_ROLES; peran lain hanya lewat user_warehouses", async () => {
    for (const role of ROLES) {
      const [{ allowed }] = (
        await db.execute(sql`select can_access_warehouse(${roleUsers[role]}, ${gb1}) as allowed`)
      ).rows as { allowed: boolean }[]
      expect({ role, allowed }).toEqual({ role, allowed: ALL_WAREHOUSE_ROLES.includes(role) })
    }
  })

  test("Admin gudang hanya melihat gudang yang diberikan; akses bisa dicabut", async () => {
    const gudang = roleUsers.admin_gudang
    const visible = async () =>
      (
        await listWarehouses({ userId: gudang, search: "ZQGB", page: 1, pageSize: 20, offset: 0 })
      ).rows.map((row) => row.code)

    expect(await visible()).toEqual([])

    loginAs(["administrator"])
    expect(await grantWarehouseAccess({ warehouseId: gb1, userId: gudang })).toMatchObject({
      ok: true,
    })
    expect(await visible()).toEqual(["ZQGB1"])
    expect(await listWarehouseUsers(gb1)).toEqual([
      expect.objectContaining({ id: gudang, roles: ["admin_gudang"] }),
    ])

    await revokeWarehouseAccess({ warehouseId: gb1, userId: gudang })
    expect(await visible()).toEqual([])
  })

  test("hanya izin user:manage yang boleh memberi akses", async () => {
    loginAs(["manajer"])
    const result = await grantWarehouseAccess({ warehouseId: gb1, userId: roleUsers.staf_exim })
    expect(result).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })
  })
})

describe("aksi gudang dan lokasi", () => {
  test("flag berikat tercatat di audit log dengan nilai lama dan baru", async () => {
    const admin = loginAs(["administrator"])
    const created = await createWarehouse(
      null,
      form({ code: "ZQGB3", name: "Gudang Tiga", address: "Cikarang", category: "finished_good" }),
    )
    expect(created).toMatchObject({ ok: true })
    const id = created.ok ? created.data.id : ""
    const [row] = await db.select().from(warehouses).where(eq(warehouses.id, id))
    expect(row.isBonded).toBe(false)

    await updateWarehouse(
      null,
      form({
        id,
        name: "Gudang Tiga",
        address: "Cikarang",
        category: "finished_good",
        isBonded: "on",
        active: "on",
      }),
    )

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.tableName, "warehouses"), eq(auditLogs.recordId, id)))
      .orderBy(desc(auditLogs.id))
      .limit(1)
    expect(log).toMatchObject({
      action: "UPDATE",
      userId: admin.id,
      oldData: expect.objectContaining({ is_bonded: false }),
      newData: expect.objectContaining({ is_bonded: true }),
    })
  })

  test("kode gudang dan kode lokasi ganda ditolak dengan pesan jelas", async () => {
    const warehouse = await createWarehouse(
      null,
      form({ code: "ZQGB1", name: "X", address: "X", category: "wip" }),
    )
    expect(warehouse).toMatchObject({ ok: false, errors: ["Kode gudang ZQGB1 sudah dipakai."] })

    await createLocation(
      null,
      form({ warehouseId: gb2, code: "ZQL1", name: "Rak", type: "internal" }),
    )
    const duplicate = await createLocation(
      null,
      form({ warehouseId: gb2, code: "ZQL1", name: "Rak lagi", type: "internal" }),
    )
    expect(duplicate).toMatchObject({ ok: false, errors: ["Kode lokasi ZQL1 sudah dipakai."] })
  })

  test("hierarki lokasi lewat aksi; jalur lengkap tersedia; lingkaran ditolak dengan pesan dari database", async () => {
    const rack = await createLocation(
      null,
      form({ warehouseId: gb2, code: "ZQRAK", name: "Rak A", type: "internal" }),
    )
    const rackId = rack.ok ? rack.data.id : ""
    const bin = await createLocation(
      null,
      form({ warehouseId: gb2, code: "ZQBIN", name: "Bin 1", type: "internal", parentId: rackId }),
    )
    const binId = bin.ok ? bin.data.id : ""
    expect((await getLocation(binId))?.path).toBe("ZQRAK/ZQBIN")

    const cycle = await updateLocation(
      null,
      form({ id: rackId, name: "Rak A", parentId: binId, active: "on" }),
    )
    expect(cycle).toMatchObject({
      ok: false,
      errors: ["Lokasi induk tidak boleh berada di bawah lokasi ini sendiri."],
    })
  })

  test("daftar gudang menghitung lokasi di dalam masing-masing gudang", async () => {
    await createLocation(
      null,
      form({ warehouseId: gb1, code: "ZQC1", name: "Satu", type: "internal" }),
    )
    await createLocation(
      null,
      form({ warehouseId: gb1, code: "ZQC2", name: "Dua", type: "transit" }),
    )

    const { rows } = await listWarehouses({
      userId: roleUsers.administrator,
      search: "ZQGB1",
      page: 1,
      pageSize: 20,
      offset: 0,
    })
    expect(rows.map((row) => [row.code, row.locationCount])).toEqual([["ZQGB1", 2]])
  })

  test("tipe lokasi virtual tidak bisa dibuat di dalam gudang lewat form", async () => {
    const result = await createLocation(
      null,
      form({ warehouseId: gb1, code: "ZQV1", name: "Vendor", type: "vendor" }),
    )
    expect(result).toMatchObject({ ok: false, errors: ["Tipe lokasi wajib dipilih."] })
  })

  test("peran selain Administrator tidak bisa mengubah gudang dan lokasi", async () => {
    for (const role of ["manajer", "staf_exim", "admin_gudang", "auditor"] as const) {
      loginAs([role])
      const results = await Promise.all([
        createWarehouse(null, form({ code: "ZQNO", name: "X", address: "X", category: "wip" })),
        createLocation(null, form({ warehouseId: gb1, code: "ZQNO", name: "X", type: "internal" })),
      ])
      for (const result of results) expect(result.ok).toBe(false)
    }
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(locations)
      .where(inArray(locations.code, ["ZQNO"]))
    expect(row.count).toBe(0)
  })
})
