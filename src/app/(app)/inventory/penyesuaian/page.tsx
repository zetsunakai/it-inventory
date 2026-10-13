import type { Metadata } from "next"

import { TransferListPage } from "@/components/inventory/transfer-pages"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Penyesuaian · IT Inventory" }

export default function AdjustmentsPage({ searchParams }: PageProps<"/inventory/penyesuaian">) {
  return (
    <TransferListPage
      kind={TRANSFER_KINDS.adjustment}
      title="Penyesuaian"
      description="Koreksi stok karena hilang, rusak, atau selisih hitung. Stok berubah setelah disetujui Manajer."
      searchParams={searchParams}
    />
  )
}
