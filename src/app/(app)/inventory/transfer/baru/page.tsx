import type { Metadata } from "next"

import { NewTransferPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Buat transfer internal · IT Inventory" }

export default function NewInternalTransferPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.internal}
      description="Disimpan sebagai Draft. Stok lokasi asal dicek saat dikonfirmasi dan saat divalidasi."
    />
  )
}
