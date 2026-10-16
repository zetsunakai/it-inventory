import type { Metadata } from "next"

import { TransferScanPage } from "@/components/inventory/transfer-scan-page"
import { TRANSFER_KINDS } from "@/lib/transfer"

export const metadata: Metadata = { title: "Scan pengiriman · IT Inventory" }

export default function DeliveryScanPage({ params }: PageProps<"/inventory/pengiriman/[id]/scan">) {
  return <TransferScanPage kind={TRANSFER_KINDS.delivery} params={params} />
}
