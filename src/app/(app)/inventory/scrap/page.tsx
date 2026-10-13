import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Scrap · IT Inventory" }

export default function ScrapsPage({ searchParams }: PageProps<"/inventory/scrap">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.scrap}
      title="Scrap"
      description="Barang rusak atau reject dipindah ke lokasi scrap. Stok berkurang setelah disetujui Manajer."
      searchParams={searchParams}
    />
  )
}
