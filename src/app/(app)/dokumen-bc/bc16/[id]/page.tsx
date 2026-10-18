import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC16 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 1.6 · IT Inventory" }

export default function Bc16DetailPage({ params }: PageProps<"/dokumen-bc/bc16/[id]">) {
  return <CustomsDocumentDetailPage spec={BC16} params={params} />
}
