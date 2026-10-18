import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC262 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.6.2 · IT Inventory" }

export default function Bc262DetailPage({ params }: PageProps<"/dokumen-bc/bc262/[id]">) {
  return <CustomsDocumentDetailPage spec={BC262} params={params} />
}
