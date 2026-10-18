import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC33 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 3.3 · IT Inventory" }

export default function Bc33DetailPage({ params }: PageProps<"/dokumen-bc/bc33/[id]">) {
  return <CustomsDocumentDetailPage spec={BC33} params={params} />
}
