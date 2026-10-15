"use server"

import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { AppError, defineAction } from "@/server/actions/define-action"
import { users, userWarehouses, warehouses } from "@/server/db/schema"

// Akses gudang per user (PRD bagian 3): izin user:manage. Diatur dari halaman detail Pengguna
// (RM-02), bukan dari master gudang.

const accessInput = z.object({
  userId: z.uuid("User tidak valid."),
  warehouseId: z.uuid("Pilih gudang terlebih dahulu."),
})

export const grantWarehouseAccess = defineAction({
  name: "grantWarehouseAccess",
  permission: "user:manage",
  schema: accessInput,
  successMessage: "Akses diberikan.",
  handler: async ({ input, tx }) => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.userId))
    if (!user) throw new AppError("User tidak ditemukan.")
    const [warehouse] = await tx
      .select({ active: warehouses.active })
      .from(warehouses)
      .where(eq(warehouses.id, input.warehouseId))
    if (!warehouse?.active) throw new AppError("Gudang tidak ditemukan atau sudah diarsipkan.")
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
