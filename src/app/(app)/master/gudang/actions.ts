"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { INVENTORY_CATEGORIES, WAREHOUSE_LOCATION_TYPES } from "@/lib/inventory"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import { locations, users, userWarehouses, warehouses } from "@/server/db/schema"

// Gudang dan lokasi (PRD bagian 5.1): hanya Administrator (izin master:write).
// Akses gudang per user: izin user:manage. Kode, tipe, dan gudang sebuah lokasi tidak bisa
// diubah setelah dibuat; aturannya dipaksakan trigger di database (migrasi 0013).

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} wajib diisi.`).max(max, `${label} maksimal ${max} karakter.`)

// Checkbox hanya terkirim saat dicentang.
const checkbox = z
  .literal("on")
  .optional()
  .transform((value) => value === "on")

const warehouseFields = {
  name: text("Nama gudang", 200),
  address: text("Alamat", 500),
  category: z.enum(INVENTORY_CATEGORIES, "Kategori gudang wajib dipilih."),
  isBonded: checkbox,
}

export const createWarehouse = defineFormAction({
  name: "createWarehouse",
  permission: "master:write",
  schema: z.object({ code: text("Kode gudang", 30), ...warehouseFields }),
  successMessage: "Gudang ditambahkan.",
  handler: async ({ input, tx }) => {
    const [existing] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.code, input.code))
    if (existing) throw new AppError(`Kode gudang ${input.code} sudah dipakai.`)

    const [row] = await tx.insert(warehouses).values(input).returning({ id: warehouses.id })
    return row
  },
})

export const updateWarehouse = defineFormAction({
  name: "updateWarehouse",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Gudang tidak valid."), ...warehouseFields, active: checkbox }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [row] = await tx
      .update(warehouses)
      .set(values)
      .where(eq(warehouses.id, id))
      .returning({ id: warehouses.id })
    if (!row) throw new AppError("Gudang tidak ditemukan.")
    return row
  },
})

// Kosong = tanpa induk (lokasi paling atas di gudang).
const parentId = z
  .union([z.uuid(), z.literal("")])
  .optional()
  .transform((value) => value || null)

export const createLocation = defineFormAction({
  name: "createLocation",
  permission: "master:write",
  schema: z.object({
    warehouseId: z.uuid("Gudang tidak valid."),
    code: text("Kode lokasi", 30),
    name: text("Nama lokasi", 200),
    type: z.enum(WAREHOUSE_LOCATION_TYPES, "Tipe lokasi wajib dipilih."),
    parentId,
  }),
  successMessage: "Lokasi ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors: string[] = []
    const [warehouse] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(eq(warehouses.id, input.warehouseId))
    if (!warehouse) errors.push("Gudang tidak ditemukan.")
    const [existing] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.code, input.code))
    if (existing) errors.push(`Kode lokasi ${input.code} sudah dipakai.`)
    if (errors.length) throw new AppError(errors)

    // Induk di gudang yang sama dan tanpa lingkaran dicek trigger locations_guard.
    const [row] = await tx.insert(locations).values(input).returning({ id: locations.id })
    return row
  },
})

export const updateLocation = defineFormAction({
  name: "updateLocation",
  permission: "master:write",
  schema: z.object({
    id: z.uuid("Lokasi tidak valid."),
    name: text("Nama lokasi", 200),
    parentId,
    active: checkbox,
  }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [row] = await tx
      .update(locations)
      .set(values)
      .where(eq(locations.id, id))
      .returning({ id: locations.id })
    if (!row) throw new AppError("Lokasi tidak ditemukan.")
  },
})

const accessInput = z.object({
  warehouseId: z.uuid("Gudang tidak valid."),
  userId: z.uuid("Pilih user terlebih dahulu."),
})

export const grantWarehouseAccess = defineAction({
  name: "grantWarehouseAccess",
  permission: "user:manage",
  schema: accessInput,
  successMessage: "Akses diberikan.",
  handler: async ({ input, tx }) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId))
    if (!user) throw new AppError("User tidak ditemukan.")
    await tx.insert(userWarehouses).values(input).onConflictDoNothing()
  },
})

export const revokeWarehouseAccess = defineAction({
  name: "revokeWarehouseAccess",
  permission: "user:manage",
  schema: accessInput,
  successMessage: "Akses dicabut.",
  handler: async ({ input, tx }) => {
    await tx
      .delete(userWarehouses)
      .where(
        and(
          eq(userWarehouses.userId, input.userId),
          eq(userWarehouses.warehouseId, input.warehouseId),
        ),
      )
  },
})
