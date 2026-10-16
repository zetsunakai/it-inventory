import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail pindah lokasi · IT Inventory" }

export default function InternalTransferPage({ params }: PageProps<"/inventory/transfer/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.internal}
      effect="Stok pindah dari lokasi asal ke lokasi tujuan"
      params={params}
    />
  )
}
