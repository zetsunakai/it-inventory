import type { Metadata } from "next"

import { TransferListPage } from "@/modules/inventory/components/transfer-pages"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Pindah lokasi · IT Inventory" }

export default function InternalTransfersPage({ searchParams }: PageProps<"/inventory/transfer">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.internal}
      title="Pindah lokasi"
      description="Pindah barang antar lokasi di dalam satu gudang. Saldo gudang tidak berubah."
      searchParams={searchParams}
    />
  )
}
