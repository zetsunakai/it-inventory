import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Retur · IT Inventory" }

export default function ReturnsPage({ searchParams }: PageProps<"/inventory/retur">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.return}
      title="Retur"
      description="Kebalikan penerimaan atau pengiriman yang sudah Selesai. Buat retur dari halaman transfer asalnya."
      searchParams={searchParams}
    />
  )
}
