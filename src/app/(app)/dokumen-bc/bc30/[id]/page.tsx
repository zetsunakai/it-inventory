import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC30 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 3.0 · IT Inventory" }

export default function Bc30DetailPage({ params }: PageProps<"/dokumen-bc/bc30/[id]">) {
  return <CustomsDocumentDetailPage spec={BC30} params={params} />
}
