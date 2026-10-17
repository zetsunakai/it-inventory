import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC40 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 4.0 · IT Inventory" }

export default function Bc40DetailPage({ params }: PageProps<"/dokumen-bc/bc40/[id]">) {
  return <CustomsDocumentDetailPage spec={BC40} params={params} />
}
