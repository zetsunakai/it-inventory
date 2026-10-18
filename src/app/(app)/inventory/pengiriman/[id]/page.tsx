import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TransferCustomsPanel } from "@/modules/it-inventory/components/customs/transfer-customs-panel"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail pengiriman · IT Inventory" }

export default function DeliveryPage({ params }: PageProps<"/inventory/pengiriman/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.delivery}
      effect="Stok di lokasi asal berkurang"
      params={params}
      // Dokumen BC penerimaan/pengiriman (M4-04, M4-05), dari modul IT Inventory.
      panel={(transfer) => <TransferCustomsPanel transferId={transfer.id} />}
    />
  )
}
