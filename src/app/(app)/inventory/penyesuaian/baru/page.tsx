import type { Metadata } from "next"

import { NewTransferPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Buat penyesuaian · IT Inventory" }

export default function NewAdjustmentPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.adjustment}
      description="Disimpan sebagai Draft. Alasan wajib; stok berubah setelah Manajer menyetujui."
    />
  )
}
