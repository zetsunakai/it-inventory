import type { Metadata } from "next"

import { TransferDetailPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Detail penyesuaian · IT Inventory" }

export default function AdjustmentPage({ params }: PageProps<"/inventory/penyesuaian/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.adjustment}
      effect="Stok di lokasi gudang bertambah atau berkurang sesuai arah penyesuaian"
      params={params}
    />
  )
}
