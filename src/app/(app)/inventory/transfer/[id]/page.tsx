import type { Metadata } from "next"

import { TransferDetailPage } from "@/modules/inventory/components/transfer-pages"
import { TransferCustomsPanel } from "@/modules/it-inventory/components/customs/transfer-customs-panel"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Detail pindah lokasi · IT Inventory" }

export default function InternalTransferPage({ params }: PageProps<"/inventory/transfer/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.internal}
      effect="Stok pindah dari lokasi asal ke lokasi tujuan"
      params={params}
      // Dokumen BC kaki antar gudang (itw_in/itw_out, H-02); pindah lokasi biasa tanpa panel.
      panel={(transfer) => <TransferCustomsPanel transferId={transfer.id} />}
    />
  )
}
