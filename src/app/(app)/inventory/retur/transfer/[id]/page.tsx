import type { Metadata } from "next"

import { TransferDetailPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Detail transfer retur · IT Inventory" }

export default function ReturnPage({ params }: PageProps<"/inventory/retur/transfer/[id]">) {
  return (
    <TransferDetailPage
      kind={TRANSFER_KINDS.return}
      effect="Barang berpindah kebalikan arah transfer asalnya"
      params={params}
    />
  )
}
