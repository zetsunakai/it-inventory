import type { Metadata } from "next"

import { TransferDetailPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Detail pemakaian · IT Inventory" }

export default function ScrapPage({ params }: PageProps<"/inventory/scrap/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.scrap}
      effect="Stok di lokasi asal berkurang ke lokasi scrap"
      params={params}
    />
  )
}
