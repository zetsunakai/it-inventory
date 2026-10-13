import type { Metadata } from "next"

import { TransferDetailPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Detail transfer internal · IT Inventory" }

export default function InternalTransferPage({ params }: PageProps<"/inventory/transfer/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.internal}
      effect="Stok pindah dari lokasi asal ke lokasi tujuan"
      params={params}
    />
  )
}
