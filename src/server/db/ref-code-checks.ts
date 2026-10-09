import { and, eq, isNull } from "drizzle-orm"

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
