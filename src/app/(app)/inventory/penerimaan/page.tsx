import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Penerimaan · IT Inventory" }

export default function ReceiptsPage({ searchParams }: PageProps<"/inventory/penerimaan">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.receipt}
      title="Penerimaan"
      description="Barang masuk dari vendor. Stok bertambah saat penerimaan divalidasi."
      searchParams={searchParams}
    />
  )
}
