import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Transfer internal · IT Inventory" }

export default function InternalTransfersPage({ searchParams }: PageProps<"/inventory/transfer">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.internal}
      title="Transfer internal"
      description="Pindah barang antar lokasi atau antar gudang sendiri. Total stok perusahaan tidak berubah."
      searchParams={searchParams}
    />
  )
}
