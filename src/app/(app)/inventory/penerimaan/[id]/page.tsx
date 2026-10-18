import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TransferCustomsPanel } from "@/modules/it-inventory/components/customs/transfer-customs-panel"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail penerimaan · IT Inventory" }

export default function ReceiptPage({ params }: PageProps<"/inventory/penerimaan/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.receipt}
      effect="Stok di lokasi tujuan bertambah"
      params={params}
      // Dokumen BC penerimaan/pengiriman (M4-04, M4-05), dari modul IT Inventory.
      panel={(transfer) => <TransferCustomsPanel transferId={transfer.id} />}
    />
  )
}
