import type { Metadata } from "next"

import { NewTransferPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Buat pengiriman · IT Inventory" }

export default function NewDeliveryPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.delivery}
      description="Disimpan sebagai Draft. Ketersediaan stok dicek saat dikonfirmasi dan saat divalidasi."
    />
  )
}
