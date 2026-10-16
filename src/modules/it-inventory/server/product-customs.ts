import "server-only"

import type { Transaction } from "@/server/db/audit"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"

// Kode HS harus ada di referensi kepabeanan dan aktif (kecuali sudah tersimpan sebelumnya).
export async function customsCodeErrors(
  tx: Transaction,
  input: { hsCode: string | null },
  saved?: { hsCode: string | null },
) {
  if (input.hsCode && !(await refCodeIsUsable(tx, "hs_code", input.hsCode, saved?.hsCode))) {
    return [`Kode HS ${input.hsCode} tidak ada di referensi kepabeanan.`]
  }
  return []
}
