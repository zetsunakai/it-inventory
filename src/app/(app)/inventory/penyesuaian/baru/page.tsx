import type { Metadata } from "next"

import { NewTransferPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Buat penyesuaian · IT Inventory" }

export default function NewAdjustmentPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.adjustment}
      description="Disimpan sebagai Draft. Alasan wajib; stok berubah setelah Manajer menyetujui."
    />
  )
}
