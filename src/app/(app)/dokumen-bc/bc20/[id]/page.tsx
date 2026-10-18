import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC20 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.0 · IT Inventory" }

export default function Bc20DetailPage({ params }: PageProps<"/dokumen-bc/bc20/[id]">) {
  return <CustomsDocumentDetailPage spec={BC20} params={params} />
}
