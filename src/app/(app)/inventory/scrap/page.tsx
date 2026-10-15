import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Pemakaian & scrap · IT Inventory" }

export default function ScrapsPage({ searchParams }: PageProps<"/inventory/scrap">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.scrap}
      title="Pemakaian & scrap"
      description="Barang dipakai, rusak, reject, atau susut di perjalanan dipindah ke lokasi scrap. Stok berkurang setelah disetujui Manajer."
      searchParams={searchParams}
    />
  )
}
