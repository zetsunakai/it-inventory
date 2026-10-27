import "server-only"

import { and, eq, inArray, isNull } from "drizzle-orm"

import type { RefCodeType } from "@/lib/ref-codes"

import type { Transaction } from "./audit"
import { refCodes } from "./schema"

// Kode referensi (tanpa induk) boleh dipakai di data master bila ada dan aktif. Kode yang
// sudah tersimpan sebelumnya tetap boleh walaupun kemudian diarsipkan, supaya data lama
// masih bisa disimpan ulang tanpa harus mengganti kodenya.
export async function refCodeIsUsable(
  tx: Transaction,
  type: RefCodeType,
  code: string,
  savedCode?: string | null,
) {
  const [row] = await tx
    .select({ active: refCodes.active })
    .from(refCodes)
    .where(and(eq(refCodes.type, type), eq(refCodes.code, code), isNull(refCodes.parentCode)))
  return Boolean(row && (row.active || code === savedCode))
}

// Banyak kode sekaligus (import, M1-07): kode → aktif atau tidak. Kode yang tidak ada di
// referensi tidak muncul di hasil.
export async function refCodeStates(tx: Transaction, type: RefCodeType, codes: string[]) {
  if (!codes.length) return new Map<string, boolean>()
  const rows = await tx
    .select({ code: refCodes.code, active: refCodes.active })
    .from(refCodes)
    .where(and(eq(refCodes.type, type), isNull(refCodes.parentCode), inArray(refCodes.code, codes)))
  return new Map(rows.map((row) => [row.code, row.active]))
}
