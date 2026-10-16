import type { Metadata } from "next"

import { NewTransferPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Buat penerimaan · IT Inventory" }

export default function NewReceiptPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.receipt}
      description="Disimpan sebagai Draft. Stok baru bertambah setelah penerimaan divalidasi."
    />
  )
}
