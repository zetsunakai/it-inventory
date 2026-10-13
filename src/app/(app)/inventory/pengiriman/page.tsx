import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Pengiriman · IT Inventory" }

export default function DeliveriesPage({ searchParams }: PageProps<"/inventory/pengiriman">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.delivery}
      title="Pengiriman"
      description="Barang keluar ke customer. Stok berkurang saat pengiriman divalidasi; stok gudang berikat tidak boleh minus."
      searchParams={searchParams}
    />
  )
}
