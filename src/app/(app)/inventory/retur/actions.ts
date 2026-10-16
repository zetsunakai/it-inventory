"use server"

import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { optionalText } from "@/lib/form-fields"
import { RETURN_LINE_ACTIONS } from "@/lib/inventory"
import { AppError, defineAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { locations, returnRequestLines, returnRequests, transfers } from "@/server/db/schema"

// Permintaan retur (backlog R-11). Aturan qty, transfer retur/pengganti, dan status dipaksakan
// database (migrasi return_request_rules); di sini hanya menyusun data dan meneruskan pesannya.

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
}

// Lokasi harus ada dan gudangnya boleh diakses user (PRD bagian 3).
async function locationErrors(tx: Transaction, userId: string, locationId: string) {
  const [location] = await tx
    .select({
      warehouseId: locations.warehouseId,
      allowed: sql<boolean>`can_access_warehouse(${userId}, ${locations.warehouseId})`,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
  if (!location?.warehouseId) return ["Lokasi gudang tidak ditemukan."]
  if (!location.allowed) return ["Anda tidak punya akses ke gudang retur ini."]
  return []
}

async function requestLocation(tx: Transaction, id: string) {
  const [request] = await tx
    .select({ locationId: returnRequests.locationId })
    .from(returnRequests)
    .where(eq(returnRequests.id, id))
  if (!request) throw new AppError("Permintaan retur tidak ditemukan.")
  return request.locationId
}

// Buat permintaan retur Draft dari penerimaan/pengiriman Selesai: baris berisi sisa qty yang masih
// bisa diretur per produk × lot (satuan stok), tindakan retur saja.
export const createReturnRequest = defineAction({
  name: "createReturnRequest",
  permission: "inventory:write",
  schema: z.object({ originId: z.uuid("Transfer asal tidak valid.") }),
  successMessage: "Permintaan retur dibuat sebagai Draft.",
  handler: async ({ input, user, tx }) => {
    const [origin] = await tx
      .select({
        type: transfers.type,
        status: transfers.status,
        partnerId: transfers.partnerId,
        sourceLocationId: transfers.sourceLocationId,
        destinationLocationId: transfers.destinationLocationId,
      })
      .from(transfers)
      .where(eq(transfers.id, input.originId))
    if (!origin) throw new AppError("Transfer asal tidak ditemukan.")
    if (origin.status !== "done" || (origin.type !== "receipt" && origin.type !== "delivery")) {
      throw new AppError(
        "Retur hanya bisa dibuat dari penerimaan atau pengiriman yang sudah Selesai.",
      )
    }
    const locationId =
      origin.type === "receipt" ? origin.destinationLocationId : origin.sourceLocationId
    const errors = await locationErrors(tx, user.id, locationId)
    if (errors.length) throw new AppError(errors)

    const remaining = await tx.execute<{ product_id: string; lot_id: string | null; qty: string }>(
      sql`select r.product_id, r.lot_id, r.qty::text
        from returnable_lines(${input.originId}) r
        join products p on p.id = r.product_id
        left join lots l on l.id = r.lot_id
        order by p.sku, l.name`,
    )
    if (!remaining.rows.length) throw new AppError("Semua barang transfer ini sudah diretur.")

    const [row] = await tx
      .insert(returnRequests)
      .values({
        // Jenis dan partner diisi ulang database dari transfer asal.
        type: origin.type === "receipt" ? "vendor" : "customer",
        partnerId: origin.partnerId!,
        originId: input.originId,
        locationId,
        scheduledDate: todayWib(),
      })
      .returning({ id: returnRequests.id })
    await tx.insert(returnRequestLines).values(
      remaining.rows.map((line, index) => ({
        returnRequestId: row.id,
        position: index + 1,
        productId: line.product_id,
        lotId: line.lot_id,
        qty: line.qty,
      })),
    )
    return { id: row.id }
  },
})

const lineInput = z.object({
  qty: z
    .string()
    .trim()
    .transform((value) => value.replace(",", "."))
    .refine((value) => /^\d+(\.\d{1,4})?$/.test(value), {
      message: "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
    }),
  action: z.enum(RETURN_LINE_ACTIONS, "Pilih tindakan retur."),
})

// Simpan permintaan Draft. Kunci baris = id baris permintaan; qty 0 = baris dihapus.
export const saveReturnRequest = defineAction({
  name: "saveReturnRequest",
  permission: "inventory:write",
  schema: z.object({
    id: z.uuid("Permintaan retur tidak valid."),
    locationId: z.uuid("Pilih lokasi gudang."),
    scheduledDate: z
      .string()
      .optional()
      .transform((value) => value || null)
      .refine(
        (value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "Tanggal tidak valid.",
      ),
    reason: optionalText("Alasan retur", 500),
    notes: optionalText("Catatan", 2000),
    lines: z.record(z.uuid(), lineInput),
  }),
  successMessage: "Permintaan retur disimpan.",
  handler: async ({ input, user, tx }) => {
    const errors = [
      ...(await locationErrors(tx, user.id, await requestLocation(tx, input.id))),
      ...(await locationErrors(tx, user.id, input.locationId)),
    ]
    if (errors.length) throw new AppError([...new Set(errors)])
    if (Object.values(input.lines).every((line) => Number(line.qty) === 0)) {
      throw new AppError(
        "Isi qty retur minimal satu baris. Untuk membatalkan, batalkan permintaan.",
      )
    }
    await tx
      .update(returnRequests)
      .set({
        locationId: input.locationId,
        // Kosong = hari ini (WIB), seperti transfer.
        scheduledDate: input.scheduledDate ?? todayWib(),
        reason: input.reason,
        notes: input.notes,
      })
      .where(eq(returnRequests.id, input.id))
    for (const [lineId, line] of Object.entries(input.lines)) {
      const where = and(
        eq(returnRequestLines.id, lineId),
        eq(returnRequestLines.returnRequestId, input.id),
      )
      if (Number(line.qty) === 0) await tx.delete(returnRequestLines).where(where)
      else
        await tx.update(returnRequestLines).set({ qty: line.qty, action: line.action }).where(where)
    }
    const result = await tx.execute<{ errors: string[] }>(
      sql`select return_request_errors(${input.id}) as errors`,
    )
    const qtyErrors = result.rows[0]?.errors ?? []
    if (qtyErrors.length) throw new AppError(qtyErrors)
  },
})

const idInput = z.object({ id: z.uuid("Permintaan retur tidak valid.") })

export const confirmReturnRequest = defineAction({
  name: "confirmReturnRequest",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Permintaan retur dikonfirmasi. Transfer retur sudah dibuat.",
  handler: async ({ input, user, tx }) => {
    const errors = await locationErrors(tx, user.id, await requestLocation(tx, input.id))
    if (errors.length) throw new AppError(errors)
    await tx.execute(sql`select confirm_return_request(${input.id})`)
  },
})

export const cancelReturnRequest = defineAction({
  name: "cancelReturnRequest",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Permintaan retur dibatalkan.",
  handler: async ({ input, user, tx }) => {
    const errors = await locationErrors(tx, user.id, await requestLocation(tx, input.id))
    if (errors.length) throw new AppError(errors)
    await tx.execute(sql`select cancel_return_request(${input.id})`)
  },
})

// Tutup tanpa pengganti (I-02): barang sudah diretur, penggantinya tidak akan ada. Transfer
// pengganti yang masih terbuka dibatalkan; aturannya di close_return_request_without_replacement().
export const closeReturnRequest = defineAction({
  name: "closeReturnRequest",
  permission: "inventory:write",
  schema: idInput.extend({ reason: optionalText("Alasan", 500) }),
  successMessage: "Permintaan retur ditutup tanpa pengganti.",
  handler: async ({ input, user, tx }) => {
    const errors = await locationErrors(tx, user.id, await requestLocation(tx, input.id))
    if (errors.length) throw new AppError(errors)
    await tx.execute(
      sql`select close_return_request_without_replacement(${input.id}, ${input.reason ?? ""})`,
    )
  },
})
