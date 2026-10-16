import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail penerimaan · IT Inventory" }

export default function ReceiptPage({ params }: PageProps<"/inventory/penerimaan/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.receipt}
      effect="Stok di lokasi tujuan bertambah"
      params={params}
    />
  )
}
