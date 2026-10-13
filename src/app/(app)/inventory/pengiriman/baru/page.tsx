import type { Metadata } from "next"

import { NewTransferPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Buat pengiriman · IT Inventory" }

export default function NewDeliveryPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.delivery}
      description="Disimpan sebagai Draft. Ketersediaan stok dicek saat ditandai Siap dan saat divalidasi."
    />
  )
}
