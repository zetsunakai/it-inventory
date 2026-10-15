import { z } from "zod"

import { parseDecimalInput } from "./decimal"
import type { MovementCode, TransferStatus, TransferType } from "./inventory"

// Form transfer (penerimaan, pengiriman, dst.): dipakai bersama oleh form di client dan server
// action. Baris barang dikirim sebagai JSON di satu field form karena jumlahnya dinamis.

export type TransferLineDraft = {
  productId: string
  inputQty: string
  uomId: string
  lotName: string
}

const lineSchema = z.object({
  productId: z.string(),
  inputQty: z.string(),
  uomId: z.string(),
  lotName: z.string().optional(),
})

export type TransferLineInput = {
  productId: string
  inputQty: string
  uomId: string
  lotName: string | null
}

// Semua kesalahan baris dilaporkan sekaligus, dengan nomor barisnya (PRD bagian 7.6).
export const transferLinesField = z.string().transform((value, ctx): TransferLineInput[] => {
  let raw: unknown
  try {
    raw = JSON.parse(value || "[]")
  } catch {
    ctx.addIssue({ code: "custom", message: "Baris barang tidak terbaca. Muat ulang halaman." })
    return z.NEVER
  }
  const parsed = z.array(lineSchema).safeParse(raw)
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Baris barang tidak terbaca. Muat ulang halaman." })
    return z.NEVER
  }
  const lines = parsed.data.filter((line) => line.productId || line.inputQty.trim())
  if (!lines.length) {
    ctx.addIssue({ code: "custom", message: "Tambahkan minimal satu baris barang." })
    return z.NEVER
  }
  const result: TransferLineInput[] = []
  lines.forEach((line, index) => {
    const label = `Baris ${index + 1}`
    const qty = parseDecimalInput(line.inputQty, 4)
    if (!z.uuid().safeParse(line.productId).success) {
      ctx.addIssue({ code: "custom", message: `${label}: pilih produk.` })
    }
    if (!qty) {
      ctx.addIssue({
        code: "custom",
        message: `${label}: qty harus angka lebih dari 0, maksimal 4 desimal.`,
      })
    }
    if (!z.uuid().safeParse(line.uomId).success) {
      ctx.addIssue({ code: "custom", message: `${label}: pilih satuan.` })
    }
    const lotName = line.lotName?.trim() || null
    if (lotName && lotName.length > 50) {
      ctx.addIssue({ code: "custom", message: `${label}: nomor lot maksimal 50 karakter.` })
    }
    result.push({ productId: line.productId, inputQty: qty ?? "", uomId: line.uomId, lotName })
  })
  return result
})

export const TRANSFER_STATUS_TONES: Record<
  TransferStatus,
  "neutral" | "info" | "success" | "warning"
> = {
  draft: "neutral",
  waiting: "warning",
  partially_available: "warning",
  ready: "info",
  done: "success",
  cancelled: "neutral",
}

// Halaman per jenis transfer. Sisi "internal" adalah lokasi gudang yang dipilih user; sisi lain
// adalah lokasi virtual (vendor, customer, scrap, penyesuaian) yang dipilih otomatis.
export type TransferKind = {
  type: TransferType
  path: string
  // Kata benda huruf kecil, mis. "penerimaan".
  noun: string
  partnerRole?: "vendor" | "customer"
  partnerLabel?: string
  // Lokasi gudang yang dipilih user: tujuan (barang masuk) atau asal (barang keluar).
  locationSide: "source" | "destination"
  locationLabel: string
  // Transfer internal: lokasi tujuan juga lokasi gudang yang dipilih user.
  secondLocationLabel?: string
  // false = tidak dibuat dari halaman ini (retur dibuat dari transfer asalnya).
  creatable?: boolean
  // Penyesuaian: user memilih arah (tambah/kurangi stok); lokasi gudang bisa jadi asal atau tujuan.
  directional?: boolean
  // Scrap dan penyesuaian: alasan wajib dan Manajer menyetujui sekaligus memvalidasi.
  needsApproval?: boolean
  // Pindah lokasi (R-09): kedua lokasi di satu gudang, divalidasi langsung dari Draft.
  sameWarehouse?: boolean
  // Daftar hanya menampilkan kode pergerakan ini (pindah lokasi tanpa transfer antar gudang).
  movementCodes?: readonly MovementCode[]
}

export const TRANSFER_KINDS = {
  receipt: {
    type: "receipt",
    path: "/inventory/penerimaan",
    noun: "penerimaan",
    partnerRole: "vendor",
    partnerLabel: "Vendor",
    locationSide: "destination",
    locationLabel: "Lokasi tujuan",
  },
  delivery: {
    type: "delivery",
    path: "/inventory/pengiriman",
    noun: "pengiriman",
    partnerRole: "customer",
    partnerLabel: "Customer",
    locationSide: "source",
    locationLabel: "Lokasi asal",
  },
  internal: {
    type: "internal",
    path: "/inventory/transfer",
    noun: "pindah lokasi",
    locationSide: "source",
    locationLabel: "Lokasi asal",
    secondLocationLabel: "Lokasi tujuan",
    sameWarehouse: true,
    movementCodes: ["ilt"],
  },
  return: {
    type: "return",
    path: "/inventory/retur",
    noun: "retur",
    partnerLabel: "Partner",
    locationSide: "source",
    locationLabel: "Lokasi asal",
    secondLocationLabel: "Lokasi tujuan",
    creatable: false,
  },
  scrap: {
    type: "scrap",
    path: "/inventory/scrap",
    noun: "scrap",
    locationSide: "source",
    locationLabel: "Lokasi asal",
    needsApproval: true,
  },
  adjustment: {
    type: "adjustment",
    path: "/inventory/penyesuaian",
    noun: "penyesuaian",
    locationSide: "source",
    locationLabel: "Lokasi gudang",
    directional: true,
    needsApproval: true,
  },
} satisfies Partial<Record<TransferType, TransferKind>>
