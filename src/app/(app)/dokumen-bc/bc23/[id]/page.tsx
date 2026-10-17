import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.3 · IT Inventory" }

export default function Bc23DetailPage({ params }: PageProps<"/dokumen-bc/bc23/[id]">) {
  return <CustomsDocumentDetailPage spec={BC23} params={params} />
}
