import type { Metadata } from "next"

import { NewTransferPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Buat pemakaian · IT Inventory" }

export default function NewScrapPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.scrap}
      description="Disimpan sebagai Draft. Jenis dan alasan wajib; stok berkurang setelah Manajer menyetujui."
    />
  )
}
