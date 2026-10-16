import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail pengiriman · IT Inventory" }

export default function DeliveryPage({ params }: PageProps<"/inventory/pengiriman/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.delivery}
      effect="Stok di lokasi asal berkurang"
      params={params}
    />
  )
}
