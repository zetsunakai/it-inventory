import { eq, like } from "drizzle-orm"
import { afterAll, beforeEach, expect, test, vi } from "vitest"

import { createWarehouse, updateWarehouse } from "@/app/(app)/master/gudang/actions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { locations, warehouses } from "@/server/db/schema"
import type { WarehouseLocationDraft } from "@/modules/inventory/lib/warehouse-locations"

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

beforeEach(() => {
  session.user = {
    id: crypto.randomUUID(),
    name: "Test",
    email: "test@locations.local",
    roles: ["administrator"],
    twoFactorEnabled: true,
  }
})
afterAll(async () => {
  await db.update(warehouses).set({ stockLocationId: null }).where(like(warehouses.code, "ZEB%"))
  await db.update(locations).set({ parentId: null }).where(like(locations.code, "ZEB%"))
  await db.delete(locations).where(like(locations.code, "ZEB%"))
  await db.delete(warehouses).where(like(warehouses.code, "ZEB%"))
  await db.$client.end()
})
function row(code: string, parentId: string | null = null): WarehouseLocationDraft {
  return {
    id: crypto.randomUUID(),
    code,
    name: code,
    type: "internal",
    parentId,
    active: true,
    isNew: true,
  }
}
function form(
  values: Record<string, string>,
  rows: WarehouseLocationDraft[],
  deletedIds: string[] = [],
) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  data.set("locationRows", JSON.stringify({ rows, deletedIds }))
  return data
}
async function create(code: string, rows: WarehouseLocationDraft[]) {
  const result = await createWarehouse(
    null,
    form({ code, name: code, address: "Alamat\nBaris kedua" }, rows),
  )
  if (!result.ok) throw new Error(result.errors.join("; "))
  return result.data.id
}
async function save(
  id: string,
  rows: WarehouseLocationDraft[],
  deletedIds: string[] = [],
  stockLocationId = "",
) {
  return updateWarehouse(
    null,
    form(
      { id, name: "Nama baru", address: "Alamat baru", active: "on", stockLocationId },
      rows,
      deletedIds,
    ),
  )
}

test("buat gudang bersama induk dan anak yang belum tersimpan, meski urutan anak lebih dahulu", async () => {
  const parent = row("ZEB-P1"),
    child = row("ZEB-C1", parent.id)
  const id = await create("ZEB-W1", [child, parent])
  const saved = await db.select().from(locations).where(eq(locations.warehouseId, id))
  expect(saved).toHaveLength(2)
  expect(saved.find((entry) => entry.id === child.id)?.parentId).toBe(parent.id)
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id))
  expect(warehouse.stockLocationId).toBe(parent.id)
})

test("seluruh data gudang dan lokasi rollback bila salah satu kode baru bentrok", async () => {
  const existing = row("ZEB-TAKEN")
  await create("ZEB-W2", [existing])
  const result = await createWarehouse(
    null,
    form({ code: "ZEB-ROLLBACK", name: "Rollback", address: "Alamat" }, [
      row("ZEB-FIRST"),
      row(existing.code),
    ]),
  )
  expect(result.ok).toBe(false)
  expect(
    await db.select().from(warehouses).where(eq(warehouses.code, "ZEB-ROLLBACK")),
  ).toHaveLength(0)
  expect(await db.select().from(locations).where(eq(locations.code, "ZEB-FIRST"))).toHaveLength(0)
})

test("menolak perubahan dan penghapusan lokasi milik gudang lain", async () => {
  const foreign = row("ZEB-FOREIGN")
  await create("ZEB-W3", [foreign])
  const id = await create("ZEB-W4", [])
  expect((await save(id, [{ ...foreign, isNew: false, name: "Hijack" }])).ok).toBe(false)
  expect((await save(id, [], [foreign.id])).ok).toBe(false)
  expect((await save(id, [row("ZEB-PARENT-FOREIGN", foreign.id)])).ok).toBe(false)
  const [saved] = await db.select().from(locations).where(eq(locations.id, foreign.id))
  expect(saved.name).toBe(foreign.code)
})

test("menolak lingkaran antar lokasi baru tanpa menyimpan gudang", async () => {
  const first = row("ZEB-CYCLE-A"),
    second = row("ZEB-CYCLE-B", first.id)
  first.parentId = second.id
  const result = await createWarehouse(
    null,
    form({ code: "ZEB-CYCLE", name: "Cycle", address: "Alamat" }, [first, second]),
  )
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.errors.join(" ")).toContain("lingkaran")
  expect(await db.select().from(warehouses).where(eq(warehouses.code, "ZEB-CYCLE"))).toHaveLength(0)
})

test("kode dan tipe tersimpan tetap terkunci; lokasi anak harus dipindahkan sebelum induk dihapus", async () => {
  const parent = row("ZEB-P5"),
    child = row("ZEB-C5", parent.id)
  const id = await create("ZEB-W5", [parent, child])
  expect((await save(id, [{ ...parent, isNew: false, code: "ZEB-CHANGED" }])).ok).toBe(false)
  expect((await save(id, [{ ...child, isNew: false }], [parent.id])).ok).toBe(false)
  const result = await save(
    id,
    [{ ...child, isNew: false, parentId: null, name: "Anak dipindahkan" }],
    [parent.id],
    child.id,
  )
  expect(result.ok).toBe(true)
  expect(await db.select().from(locations).where(eq(locations.id, parent.id))).toHaveLength(0)
  const [saved] = await db.select().from(locations).where(eq(locations.id, child.id))
  expect(saved.parentId).toBeNull()
  expect(saved.name).toBe("Anak dipindahkan")
})

test("anak yang ditambahkan setelah form dibuka tetap terlindungi saat induknya dihapus", async () => {
  const first = row("ZEB-P6"),
    child = row("ZEB-C6", first.id)
  const id = await create("ZEB-W6", [first, child])
  // Sebuah anak lain yang dibuat setelah form dibuka tetap dilindungi FK/validasi.
  const concurrent = row("ZEB-CONCURRENT", child.id)
  await db.insert(locations).values({
    id: concurrent.id,
    code: concurrent.code,
    name: concurrent.name,
    type: concurrent.type,
    parentId: concurrent.parentId,
    active: concurrent.active,
    warehouseId: id,
  })
  const result = await save(id, [{ ...first, isNew: false }], [child.id], first.id)
  expect(result.ok).toBe(false)
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id))
  expect(warehouse.name).toBe("ZEB-W6")
})

test("memindahkan lokasi stok utama dan mengarsipkan yang lama dalam satu penyimpanan", async () => {
  const old = row("ZEB-OLD"),
    next = row("ZEB-NEXT")
  const id = await create("ZEB-W7", [old, next])
  const result = await save(
    id,
    [
      { ...old, isNew: false, active: false },
      { ...next, isNew: false },
    ],
    [],
    next.id,
  )
  expect(result.ok).toBe(true)
})
