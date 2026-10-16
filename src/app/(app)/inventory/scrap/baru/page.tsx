import type { Metadata } from "next"

import { NewTransferPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Buat pemakaian · IT Inventory" }

export default function NewScrapPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.scrap}
      description="Disimpan sebagai Draft. Jenis dan alasan wajib; stok berkurang setelah Manajer menyetujui."
    />
  )
}
