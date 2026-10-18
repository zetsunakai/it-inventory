import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC261 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.6.1 · IT Inventory" }

export default function Bc261DetailPage({ params }: PageProps<"/dokumen-bc/bc261/[id]">) {
  return <CustomsDocumentDetailPage spec={BC261} params={params} />
}
