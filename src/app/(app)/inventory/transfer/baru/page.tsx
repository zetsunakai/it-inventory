import type { Metadata } from "next"

import { NewTransferPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Buat pindah lokasi · IT Inventory" }

export default function NewInternalTransferPage() {
  return (
    <NewTransferPage
      kind={TRANSFER_KINDS.internal}
      description="Disimpan sebagai Draft lalu bisa langsung divalidasi. Kedua lokasi harus di gudang yang sama."
    />
  )
}
