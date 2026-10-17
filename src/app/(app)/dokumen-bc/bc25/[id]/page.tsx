import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC25 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.5 · IT Inventory" }

export default function Bc25DetailPage({ params }: PageProps<"/dokumen-bc/bc25/[id]">) {
  return <CustomsDocumentDetailPage spec={BC25} params={params} />
}
