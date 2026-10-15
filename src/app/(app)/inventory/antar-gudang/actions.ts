"use server"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { optionalText } from "@/lib/form-fields"
import { transferLinesField } from "@/lib/transfer"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { interwarehouseTransferLines, interwarehouseTransfers, locations } from "@/server/db/schema"

// Transfer antar gudang (backlog R-10). Aturan, transfer keluar/masuk, dan status dipaksakan
// database (migrasi interwarehouse_rules); di sini hanya menyusun data dan meneruskan pesannya.

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Tanggal tidak valid.")

const optionalUuid = z
  .union([z.uuid("Permintaan tidak valid."), z.literal("")])
  .optional()
  .transform((value) => value || null)

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
}

// Lokasi harus ada dan gudangnya boleh diakses user (PRD bagian 3).
async function accessErrors(tx: Transaction, userId: string, ids: string[]) {
  const rows = await tx
    .select({
      id: locations.id,
      allowed: sql<boolean>`can_access_warehouse(${userId}, ${locations.warehouseId})`,
    })
    .from(locations)
    .where(inArray(locations.id, ids))
  if (rows.length !== new Set(ids).size) return ["Lokasi tidak ditemukan."]
  return rows.some((row) => !row.allowed)
    ? ["Anda tidak punya akses ke gudang asal atau tujuan."]
    : []
}

export const saveInterwarehouse = defineFormAction({
  name: "saveInterwarehouse",
  permission: "inventory:write",
  schema: z.object({
    id: optionalUuid,
    sourceLocationId: z.uuid("Pilih lokasi asal."),
    destinationLocationId: z.uuid("Pilih lokasi tujuan."),
    scheduledDate: optionalDate,
    reference: optionalText("Referensi", 100),
    notes: optionalText("Catatan", 2000),
    lines: transferLinesField,
  }),
  successMessage: "Permintaan disimpan.",
  handler: async ({ input, user, tx }) => {
    const errors = await accessErrors(tx, user.id, [
      input.sourceLocationId,
      input.destinationLocationId,
    ])
    const [transit] = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.type, "transit"),
          isNull(locations.warehouseId),
          eq(locations.active, true),
        ),
      )
      .orderBy(asc(locations.code))
      .limit(1)
    if (!transit) errors.push("Lokasi transit belum ada. Hubungi Administrator.")
    if (errors.length) throw new AppError(errors)

    const header = {
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      transitLocationId: transit.id,
      // Kosong = hari ini (WIB), seperti transfer.
      scheduledDate: input.scheduledDate ?? todayWib(),
      reference: input.reference,
      notes: input.notes,
    }
    let id = input.id
    if (id) {
      await tx.update(interwarehouseTransfers).set(header).where(eq(interwarehouseTransfers.id, id))
      await tx
        .delete(interwarehouseTransferLines)
        .where(eq(interwarehouseTransferLines.interwarehouseId, id))
    } else {
      const [row] = await tx
        .insert(interwarehouseTransfers)
        .values(header)
        .returning({ id: interwarehouseTransfers.id })
      id = row.id
    }
    await tx.insert(interwarehouseTransferLines).values(
      input.lines.map((line, index) => ({
        interwarehouseId: id,
        position: index + 1,
        productId: line.productId,
        inputQty: line.inputQty,
        inputUomId: line.uomId,
      })),
    )
    return { id }
  },
})

const idInput = z.object({ id: z.uuid("Permintaan tidak valid.") })

export const confirmInterwarehouse = defineAction({
  name: "confirmInterwarehouse",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Permintaan dikonfirmasi. Transfer keluar sudah dibuat dan memesan stok.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select confirm_interwarehouse(${input.id})`)
  },
})

export const cancelInterwarehouse = defineAction({
  name: "cancelInterwarehouse",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Permintaan dibatalkan.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select cancel_interwarehouse(${input.id})`)
  },
})

// Sisa di transit: kembali ke gudang asal atau susut transit (alasan wajib, disetujui Manajer).
export const settleInterwarehouse = defineAction({
  name: "settleInterwarehouse",
  permission: "inventory:write",
  schema: idInput.extend({
    mode: z.enum(["return", "loss"]),
    reason: z.string().trim().max(500, "Alasan maksimal 500 karakter.").optional(),
  }),
  handler: async ({ input, tx }) => {
    const result = await tx.execute<{ id: string }>(
      sql`select settle_interwarehouse(${input.id}, ${input.mode}, ${input.reason ?? null}) as id`,
    )
    return {
      transferId: result.rows[0].id,
      message:
        input.mode === "return"
          ? "Transfer kembali ke gudang asal dibuat. Validasi transfernya setelah barang tiba."
          : "Susut transit dicatat sebagai scrap. Menunggu persetujuan Manajer di halaman Pemakaian & scrap.",
    }
  },
})
