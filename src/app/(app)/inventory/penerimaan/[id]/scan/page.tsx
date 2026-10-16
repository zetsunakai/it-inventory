import type { Metadata } from "next"

import { TransferScanPage } from "@/modules/inventory/components/transfer-scan-page"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"

export const metadata: Metadata = { title: "Scan penerimaan · IT Inventory" }

export default function ReceiptScanPage({ params }: PageProps<"/inventory/penerimaan/[id]/scan">) {
  return <TransferScanPage kind={TRANSFER_KINDS.receipt} params={params} />
}
