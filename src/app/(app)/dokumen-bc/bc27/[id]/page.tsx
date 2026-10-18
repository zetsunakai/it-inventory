import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC27 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.7 · IT Inventory" }

export default function Bc27DetailPage({ params }: PageProps<"/dokumen-bc/bc27/[id]">) {
  return <CustomsDocumentDetailPage spec={BC27} params={params} />
}
