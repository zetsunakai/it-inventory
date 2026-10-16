"use server"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { checkbox, requiredText } from "@/lib/form-fields"
import { WAREHOUSE_LOCATION_TYPES } from "@/modules/inventory/lib/inventory"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { locations, userWarehouses, warehouses } from "@/server/db/schema"
import { importFileSchema, readImportFile } from "@/server/master-io/common"
import {
  importLocationRows,
  LOCATION_COLUMNS,
} from "@/modules/inventory/server/master-io/locations"

// Gudang dan lokasi (PRD bagian 5.1): hanya Administrator (izin master:write). Akses gudang per
// user diatur di halaman Pengguna (RM-02). Kode, tipe, dan gudang sebuah lokasi tidak bisa
// diubah setelah dibuat; aturannya dipaksakan trigger di database (migrasi 0013).

const warehouseFields = {
  name: requiredText("Nama gudang", 200),
  address: requiredText("Alamat", 500),
}

export const createWarehouse = defineFormAction({
  name: "createWarehouse",
  permission: "master:write",
  schema: z.object({ code: requiredText("Kode gudang", 30), ...warehouseFields }),
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
    code: requiredText("Kode lokasi", 30),
    name: requiredText("Nama lokasi", 200),
    type: z.enum(WAREHOUSE_LOCATION_TYPES, "Tipe lokasi wajib dipilih."),
    parentId,
  }),
  successMessage: "Lokasi ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors: string[] = []
    const [warehouse] = await tx
      .select({ active: warehouses.active })
      .from(warehouses)
      .where(eq(warehouses.id, input.warehouseId))
    if (!warehouse) errors.push("Gudang tidak ditemukan.")
    else if (!warehouse.active) {
      errors.push("Gudang ini diarsipkan. Aktifkan dulu untuk menambah lokasi.")
    }
    if (input.parentId && !(await locationIsActive(tx, input.parentId))) {
      errors.push("Lokasi induk tidak ditemukan atau sudah diarsipkan.")
    }
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
    name: requiredText("Nama lokasi", 200),
    parentId,
    active: checkbox,
  }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [saved] = await tx
      .select({ parentId: locations.parentId })
      .from(locations)
      .where(eq(locations.id, id))
    if (!saved) throw new AppError("Lokasi tidak ditemukan.")
    // Induk yang diarsipkan hanya boleh bila memang induk yang tersimpan sebelumnya.
    if (
      values.parentId &&
      values.parentId !== saved.parentId &&
      !(await locationIsActive(tx, values.parentId))
    ) {
      throw new AppError("Lokasi induk tidak ditemukan atau sudah diarsipkan.")
    }
    await tx.update(locations).set(values).where(eq(locations.id, id))
  },
})

async function locationIsActive(tx: Transaction, id: string) {
  const [row] = await tx
    .select({ active: locations.active })
    .from(locations)
    .where(eq(locations.id, id))
  return Boolean(row?.active)
}

const idInput = (noun: string) => z.object({ id: z.uuid(`${noun} tidak valid.`) })

// Hapus gudang (backlog M1-08): hanya bila belum punya lokasi. Akses user ke gudang ini adalah
// pengaturan gudang itu sendiri, jadi ikut dihapus.
export const deleteWarehouse = defineAction({
  name: "deleteWarehouse",
  permission: "master:write",
  schema: idInput("Gudang"),
  successMessage: "Gudang dihapus.",
  handler: async ({ input, tx }) => {
    await tx.delete(userWarehouses).where(eq(userWarehouses.warehouseId, input.id))
    await deleteUnlessUsed(tx, warehouses, warehouses.id, input.id, "Gudang")
  },
})

// Hapus lokasi: hanya lokasi di dalam gudang yang belum dipakai dan tidak punya lokasi anak.
// Lokasi virtual (vendor, customer, scrap, penyesuaian) dibuat sistem dan selalu dibutuhkan.
export const deleteLocation = defineAction({
  name: "deleteLocation",
  permission: "master:write",
  schema: idInput("Lokasi"),
  successMessage: "Lokasi dihapus.",
  handler: async ({ input, tx }) => {
    const [location] = await tx
      .select({ warehouseId: locations.warehouseId })
      .from(locations)
      .where(eq(locations.id, input.id))
    if (!location) throw new AppError("Lokasi tidak ditemukan.")
    if (!location.warehouseId) {
      throw new AppError("Lokasi virtual dibuat oleh sistem dan tidak bisa dihapus.")
    }
    const [child] = await tx
      .select({ code: locations.code })
      .from(locations)
      .where(eq(locations.parentId, input.id))
      .limit(1)
    if (child) {
      throw new AppError(
        `Lokasi ini masih punya lokasi di bawahnya (${child.code}). Hapus atau pindahkan dulu lokasi itu, atau arsipkan saja.`,
      )
    }
    await deleteUnlessUsed(tx, locations, locations.id, input.id, "Lokasi")
  },
})

// Import lokasi dari Excel/CSV (backlog M1-07), dengan aturan yang sama seperti importProducts.
export const importLocations = defineFormAction({
  name: "importLocations",
  permission: "master:write",
  schema: importFileSchema,
  handler: async ({ input, tx }) =>
    importLocationRows(tx, await readImportFile(input.file, LOCATION_COLUMNS, "code")),
})
