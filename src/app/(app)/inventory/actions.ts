"use server"

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { optionalText } from "@/lib/form-fields"
import { TRANSFER_TYPES, type TransferType } from "@/lib/inventory"
import { transferLinesField, type TransferLineInput } from "@/lib/transfer"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { locations, lots, products, stockMoves, transferLines, transfers } from "@/server/db/schema"

// Transfer inventory (PRD bagian 6, backlog M2-03 dst.): simpan draft, tandai siap, validasi,
// batal. Aturan stok, lokasi, dan penguncian dipaksakan database (validate_transfer dan trigger
// di migrasi inventory_rules/validate_transfer); di sini hanya menyusun data dan meneruskan
// pesan kesalahannya.

// Lokasi virtual di sisi luar transfer, dibuat seed. Transfer internal tidak punya sisi luar:
// kedua lokasinya dipilih user.
const VIRTUAL_SIDE: Partial<Record<TransferType, "vendor" | "customer" | "scrap" | "adjustment">> =
  {
    receipt: "vendor",
    delivery: "customer",
    scrap: "scrap",
    adjustment: "adjustment",
  }

// Jenis yang punya partner (vendor/customer) dan yang wajib alasan serta persetujuan Manajer.
const WITH_PARTNER: TransferType[] = ["receipt", "delivery"]
const NEEDS_APPROVAL: TransferType[] = ["scrap", "adjustment"]

// Lokasi gudang yang dipilih user harus ada dan gudangnya boleh diakses (PRD bagian 3).
async function warehouseLocationErrors(
  tx: Transaction,
  userId: string,
  locationId: string,
  messages: { missing: string; forbidden: string },
) {
  const [location] = await tx
    .select({
      warehouseId: locations.warehouseId,
      allowed: sql<boolean>`can_access_warehouse(${userId}, ${locations.warehouseId})`,
    })
    .from(locations)
    .where(eq(locations.id, locationId))
  if (!location?.warehouseId) return [messages.missing]
  if (!location.allowed) return [messages.forbidden]
  return []
}

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Tanggal tidak valid.")

const optionalUuid = (label: string) =>
  z
    .union([z.uuid(`${label} tidak valid.`), z.literal("")])
    .optional()
    .transform((value) => value || null)

export const saveTransfer = defineFormAction({
  name: "saveTransfer",
  permission: "inventory:write",
  schema: z.object({
    id: optionalUuid("Transfer"),
    type: z.enum(TRANSFER_TYPES),
    partnerId: optionalUuid("Partner"),
    locationId: z.uuid("Pilih lokasi gudang."),
    // Lokasi tujuan transfer internal.
    otherLocationId: optionalUuid("Lokasi tujuan"),
    scheduledDate: optionalDate,
    reference: optionalText("Referensi", 100),
    notes: optionalText("Catatan", 2000),
    // Scrap dan penyesuaian: alasan wajib; penyesuaian juga arahnya.
    reason: optionalText("Alasan", 500),
    direction: z.enum(["increase", "decrease"]).optional(),
    lines: transferLinesField,
  }),
  successMessage: "Transfer disimpan.",
  handler: async ({ input, user, tx }) => {
    const errors: string[] = []
    const virtualType = VIRTUAL_SIDE[input.type]
    if (!virtualType && input.type !== "internal") {
      throw new AppError("Jenis transfer ini belum didukung.")
    }
    const withPartner = WITH_PARTNER.includes(input.type)
    if (withPartner && !input.partnerId) errors.push(`Pilih ${virtualType}.`)
    if (NEEDS_APPROVAL.includes(input.type) && !input.reason) errors.push("Alasan wajib diisi.")
    if (input.type === "adjustment" && !input.direction) {
      errors.push("Pilih arah penyesuaian: tambah atau kurangi stok.")
    }
    errors.push(
      ...(await warehouseLocationErrors(tx, user.id, input.locationId, {
        missing: "Lokasi gudang tidak ditemukan.",
        forbidden: "Anda tidak punya akses ke gudang lokasi ini.",
      })),
    )

    let otherId: string | undefined
    if (input.type === "internal") {
      if (!input.otherLocationId) errors.push("Pilih lokasi tujuan.")
      else if (input.otherLocationId === input.locationId) {
        errors.push("Lokasi asal dan tujuan harus berbeda.")
      } else {
        errors.push(
          ...(await warehouseLocationErrors(tx, user.id, input.otherLocationId, {
            missing: "Lokasi tujuan tidak ditemukan.",
            forbidden: "Anda tidak punya akses ke gudang lokasi tujuan.",
          })),
        )
      }
      otherId = input.otherLocationId ?? undefined
    } else {
      const [outside] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.type, virtualType!),
            isNull(locations.warehouseId),
            eq(locations.active, true),
          ),
        )
        .orderBy(asc(locations.code))
        .limit(1)
      if (!outside) errors.push(`Lokasi virtual ${virtualType} belum ada. Hubungi Administrator.`)
      otherId = outside?.id
    }
    if (errors.length) throw new AppError(errors)

    // Barang masuk ke gudang: lokasi yang dipilih user adalah tujuan.
    const inbound =
      input.type === "receipt" || (input.type === "adjustment" && input.direction === "increase")
    const header = {
      partnerId: withPartner ? input.partnerId : null,
      reason: NEEDS_APPROVAL.includes(input.type) ? input.reason : null,
      sourceLocationId: inbound ? otherId! : input.locationId,
      destinationLocationId: inbound ? input.locationId : otherId!,
      // Kosong = hari ini (WIB); Konfirmasi mewajibkan tanggal rencana (R-06).
      scheduledDate: input.scheduledDate ?? todayWib(),
      reference: input.reference,
      notes: input.notes,
    }

    let id = input.id
    if (id) {
      const [saved] = await tx
        .select({ status: transfers.status, type: transfers.type })
        .from(transfers)
        .where(eq(transfers.id, id))
      if (!saved || saved.type !== input.type) throw new AppError("Transfer tidak ditemukan.")
      if (saved.status !== "draft") {
        throw new AppError("Hanya transfer Draft yang bisa diubah. Kembalikan ke Draft dulu.")
      }
      await tx.update(transfers).set(header).where(eq(transfers.id, id))
      // Baris permintaan dihapus beserta pergerakannya (cascade), lalu ditulis ulang.
      await tx.delete(transferLines).where(eq(transferLines.transferId, id))
    } else {
      const [row] = await tx
        .insert(transfers)
        .values({ type: input.type, ...header })
        .returning({ id: transfers.id })
      id = row.id
    }

    await insertLines(tx, id, header, input.lines, inbound)
    return { id }
  },
})

// Baris barang: lot dicari atau dibuat per produk. Qty dalam satuan stok dihitung database.
async function insertLines(
  tx: Transaction,
  transferId: string,
  header: { sourceLocationId: string; destinationLocationId: string },
  lines: TransferLineInput[],
  // Barang masuk boleh membawa lot baru; barang keluar hanya lot yang sudah ada.
  createLots: boolean,
) {
  const lotIds = new Map<string, string>()
  const lotKey = (productId: string, name: string) => `${productId}|${name}`
  const wanted = lines.filter((line) => line.lotName)
  if (wanted.length) {
    const existing = await tx
      .select({ id: lots.id, productId: lots.productId, name: lots.name })
      .from(lots)
      .where(
        inArray(
          lots.productId,
          wanted.map((line) => line.productId),
        ),
      )
    for (const lot of existing) lotIds.set(lotKey(lot.productId, lot.name), lot.id)
    if (!createLots) {
      const missing = lines.flatMap((line, index) =>
        line.lotName && !lotIds.has(lotKey(line.productId, line.lotName))
          ? [`Baris ${index + 1}: lot ${line.lotName} tidak ada untuk produk ini.`]
          : [],
      )
      if (missing.length) throw new AppError(missing)
    }
    for (const line of wanted) {
      const key = lotKey(line.productId, line.lotName!)
      if (lotIds.has(key)) continue
      const [lot] = await tx
        .insert(lots)
        .values({ productId: line.productId, name: line.lotName! })
        .returning({ id: lots.id })
      lotIds.set(key, lot.id)
    }
  }

  // Satu baris permintaan per baris form, masing-masing dengan satu pergerakan sebesar qty diminta
  // (R-05). Qty selesai yang lebih kecil diisi saat validasi (split_backorder).
  const saved = await tx
    .insert(transferLines)
    .values(
      lines.map((line, index) => ({
        transferId,
        position: index + 1,
        productId: line.productId,
        inputQty: line.inputQty,
        inputUomId: line.uomId,
      })),
    )
    .returning({ id: transferLines.id, position: transferLines.position })
  const lineIdAt = new Map(saved.map((line) => [line.position, line.id]))
  await tx.insert(stockMoves).values(
    lines.map((line, index) => ({
      transferId,
      lineId: lineIdAt.get(index + 1)!,
      position: index + 1,
      productId: line.productId,
      lotId: line.lotName ? lotIds.get(lotKey(line.productId, line.lotName)) : null,
      inputQty: line.inputQty,
      inputUomId: line.uomId,
      sourceLocationId: header.sourceLocationId,
      destinationLocationId: header.destinationLocationId,
    })),
  )
}

const idInput = z.object({ id: z.uuid("Transfer tidak valid.") })

// Alur status (PRD bagian 6.3, backlog R-06): semua perubahan status lewat fungsi database, yang
// juga memeriksa syaratnya dan melaporkan semua alasan sekaligus.

const STATUS_MESSAGES: Record<string, string> = {
  ready: "Siap divalidasi.",
  partially_available: "Stok baru tersedia sebagian.",
  waiting: "Menunggu stok tersedia.",
}

// Konfirmasi: Draft → Siap (barang masuk) atau Menunggu/Sebagian tersedia/Siap menurut stok.
export const confirmTransfer = defineAction({
  name: "confirmTransfer",
  permission: "inventory:write",
  schema: idInput,
  handler: async ({ input, tx }) => {
    const result = await tx.execute<{ status: string }>(
      sql`select confirm_transfer(${input.id}) as status`,
    )
    const status = result.rows[0].status
    return { status, message: `Transfer dikonfirmasi. ${STATUS_MESSAGES[status]}` }
  },
})

// Cek stok lagi untuk transfer yang sudah dikonfirmasi.
export const checkTransferAvailability = defineAction({
  name: "checkTransferAvailability",
  permission: "inventory:write",
  schema: idInput,
  handler: async ({ input, tx }) => {
    const result = await tx.execute<{ status: string }>(
      sql`select check_transfer_availability(${input.id}) as status`,
    )
    const status = result.rows[0].status
    return { status, message: `Stok sudah dicek. ${STATUS_MESSAGES[status]}` }
  },
})

// Lepas reservasi (R-07): stok yang dipesan dikembalikan, status kembali Menunggu.
export const releaseTransferReservation = defineAction({
  name: "releaseTransferReservation",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Reservasi dilepas. Transfer menunggu stok dipesan lagi lewat Cek stok.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select release_transfer_reservation(${input.id})`)
  },
})

export const reopenTransfer = defineAction({
  name: "reopenTransfer",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Transfer dikembalikan ke Draft.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select reset_transfer_to_draft(${input.id})`)
  },
})

export const cancelTransfer = defineAction({
  name: "cancelTransfer",
  permission: "inventory:write",
  schema: idInput,
  successMessage: "Transfer dibatalkan.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select cancel_transfer(${input.id})`)
  },
})

function todayWib() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
}

// Tanggal efektif (YYYY-MM-DD, WIB) → timestamp pukul 12.00 WIB; hari ini atau kosong = sekarang.
function effectiveTimestamp(date: string | null) {
  const today = todayWib()
  return date && date !== today ? `${date}T12:00:00+07:00` : null
}

// Qty selesai per baris permintaan untuk penerimaan/pengiriman parsial (M2-05, R-05): boleh 0,
// koma atau titik.
const doneQuantities = z
  .record(z.string(), z.string())
  .optional()
  .transform((values, ctx) => {
    if (!values) return null
    const result: Record<string, string> = {}
    for (const [lineId, raw] of Object.entries(values)) {
      const value = raw.trim().replace(",", ".")
      if (!z.uuid().safeParse(lineId).success || !/^\d+(\.\d{1,4})?$/.test(value)) {
        ctx.addIssue({
          code: "custom",
          message: "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
        })
        return z.NEVER
      }
      result[lineId] = value
    }
    return result
  })

// Validasi transfer. Tanggal efektif mundur diisi sebagai tanggal (YYYY-MM-DD, WIB) dan disimpan
// pukul 12.00 WIB; kosong = sekarang. Bila qty selesai lebih kecil dari rencana, sisanya
// dipindah ke transfer lanjutan dulu (split_backorder), dalam transaksi yang sama.
export const validateTransfer = defineAction({
  name: "validateTransfer",
  permission: "inventory:write",
  schema: idInput.extend({ effectiveDate: optionalDate, quantities: doneQuantities }),
  successMessage: "Transfer divalidasi. Stok sudah diperbarui.",
  handler: async ({ input, tx }) => {
    const effectiveAt = effectiveTimestamp(input.effectiveDate)
    let backorder: { id: string; number: string } | null = null
    // Selalu dipanggil: baris yang qty selesainya kurang dari qty diminta (juga yang tidak disebut
    // di quantities) menyisakan qty untuk transfer lanjutan.
    const split = await tx.execute<{ id: string | null }>(
      sql`select split_backorder(${input.id}, ${JSON.stringify(input.quantities ?? {})}::jsonb) as id`,
    )
    const backorderId = split.rows[0]?.id
    if (backorderId) {
      const [row] = await tx
        .select({ id: transfers.id, number: transfers.number })
        .from(transfers)
        .where(eq(transfers.id, backorderId))
      backorder = row
    }
    await tx.execute(sql`select validate_transfer(${input.id}, ${effectiveAt}::timestamptz)`)
    return { backorder }
  },
})

// Retur (M2-07): batas qty dicek database (return_errors); kosong untuk jenis lain.
async function returnErrors(tx: Transaction, transferId: string) {
  const result = await tx.execute<{ errors: string[] }>(
    sql`select return_errors(${transferId}) as errors`,
  )
  return result.rows[0]?.errors ?? []
}

// Buat retur Draft dari penerimaan/pengiriman Selesai: arah terbalik, partner sama, baris berisi
// sisa qty yang masih bisa diretur (dalam satuan stok).
export const createReturn = defineAction({
  name: "createReturn",
  permission: "inventory:write",
  schema: z.object({ originId: z.uuid("Transfer asal tidak valid.") }),
  successMessage: "Retur dibuat sebagai Draft.",
  handler: async ({ input, user, tx }) => {
    const [origin] = await tx
      .select({
        type: transfers.type,
        status: transfers.status,
        number: transfers.number,
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
    const warehouseSide =
      origin.type === "receipt" ? origin.destinationLocationId : origin.sourceLocationId
    const accessErrors = await warehouseLocationErrors(tx, user.id, warehouseSide, {
      missing: "Lokasi gudang transfer asal tidak ditemukan.",
      forbidden: "Anda tidak punya akses ke gudang transfer asal.",
    })
    if (accessErrors.length) throw new AppError(accessErrors)

    const remaining = await tx.execute<{ product_id: string; lot_id: string | null; qty: string }>(
      sql`select product_id, lot_id, qty::text from returnable_lines(${input.originId})`,
    )
    if (!remaining.rows.length) throw new AppError("Semua barang transfer ini sudah diretur.")

    const header = {
      sourceLocationId: origin.destinationLocationId,
      destinationLocationId: origin.sourceLocationId,
    }
    const [row] = await tx
      .insert(transfers)
      .values({
        type: "return",
        returnOfId: input.originId,
        partnerId: origin.partnerId,
        reference: origin.number,
        scheduledDate: todayWib(),
        ...header,
      })
      .returning({ id: transfers.id })
    const stockUoms = await tx
      .select({ id: products.id, uomId: products.uomId })
      .from(products)
      .where(
        inArray(
          products.id,
          remaining.rows.map((line) => line.product_id),
        ),
      )
    const uomOf = new Map(stockUoms.map((product) => [product.id, product.uomId]))
    // Satu baris permintaan per produk × lot, dengan satu pergerakan (R-05).
    const saved = await tx
      .insert(transferLines)
      .values(
        remaining.rows.map((line, index) => ({
          transferId: row.id,
          position: index + 1,
          productId: line.product_id,
          inputQty: line.qty,
          inputUomId: uomOf.get(line.product_id)!,
        })),
      )
      .returning({ id: transferLines.id, position: transferLines.position })
    const lineIdAt = new Map(saved.map((line) => [line.position, line.id]))
    await tx.insert(stockMoves).values(
      remaining.rows.map((line, index) => ({
        transferId: row.id,
        lineId: lineIdAt.get(index + 1)!,
        position: index + 1,
        productId: line.product_id,
        lotId: line.lot_id,
        inputQty: line.qty,
        inputUomId: uomOf.get(line.product_id)!,
        ...header,
      })),
    )
    return { id: row.id }
  },
})

// Qty retur per baris permintaan (dalam satuan stok). 0 = baris dihapus dari retur.
export const saveReturnQuantities = defineAction({
  name: "saveReturnQuantities",
  permission: "inventory:write",
  schema: idInput.extend({
    quantities: z.record(z.uuid(), z.string()).transform((values, ctx) => {
      const result: Record<string, string> = {}
      for (const [moveId, raw] of Object.entries(values)) {
        const value = raw.trim().replace(",", ".")
        if (!/^\d+(\.\d{1,4})?$/.test(value)) {
          ctx.addIssue({
            code: "custom",
            message: "Qty harus angka 0 atau lebih, maksimal 4 desimal.",
          })
          return z.NEVER
        }
        result[moveId] = value
      }
      return result
    }),
  }),
  successMessage: "Qty retur disimpan.",
  handler: async ({ input, tx }) => {
    const [saved] = await tx
      .select({ status: transfers.status, type: transfers.type })
      .from(transfers)
      .where(eq(transfers.id, input.id))
    if (!saved || saved.type !== "return") throw new AppError("Retur tidak ditemukan.")
    if (saved.status !== "draft") {
      throw new AppError("Hanya retur Draft yang bisa diubah. Kembalikan ke Draft dulu.")
    }
    if (Object.values(input.quantities).every((qty) => Number(qty) === 0)) {
      throw new AppError("Isi qty retur minimal satu baris. Untuk membatalkan, batalkan retur.")
    }
    // Kunci = id baris permintaan; baris retur selalu punya satu pergerakan bersatuan stok.
    for (const [lineId, qty] of Object.entries(input.quantities)) {
      const where = and(eq(transferLines.id, lineId), eq(transferLines.transferId, input.id))
      if (Number(qty) === 0) {
        await tx.delete(transferLines).where(where)
      } else {
        await tx.update(transferLines).set({ inputQty: qty }).where(where)
        await tx
          .update(stockMoves)
          .set({ inputQty: qty })
          .where(and(eq(stockMoves.lineId, lineId), eq(stockMoves.transferId, input.id)))
      }
    }
    const errors = await returnErrors(tx, input.id)
    if (errors.length) throw new AppError(errors)
  },
})

// Scrap dan penyesuaian (M2-08): Manajer menyetujui dan memvalidasi sekaligus, jadi pergerakan
// baru tercatat setelah disetujui. Bila validasi gagal (mis. stok kurang), persetujuan ikut batal.
export const approveTransfer = defineAction({
  name: "approveTransfer",
  permission: "inventory:approve",
  schema: idInput.extend({ effectiveDate: optionalDate }),
  successMessage: "Disetujui dan divalidasi. Stok sudah diperbarui.",
  handler: async ({ input, user, tx }) => {
    const [saved] = await tx
      .select({ type: transfers.type, status: transfers.status })
      .from(transfers)
      .where(eq(transfers.id, input.id))
    if (!saved) throw new AppError("Transfer tidak ditemukan.")
    if (!NEEDS_APPROVAL.includes(saved.type)) {
      throw new AppError("Transfer ini tidak memerlukan persetujuan.")
    }
    if (saved.status === "draft" || saved.status === "done" || saved.status === "cancelled") {
      throw new AppError("Hanya transfer yang sudah dikonfirmasi yang bisa disetujui.")
    }
    await tx
      .update(transfers)
      .set({ approvedAt: new Date(), approvedBy: user.id })
      .where(eq(transfers.id, input.id))
    await tx.execute(
      sql`select validate_transfer(${input.id}, ${effectiveTimestamp(input.effectiveDate)}::timestamptz)`,
    )
  },
})
