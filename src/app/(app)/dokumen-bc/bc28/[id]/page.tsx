import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC28 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 2.8 · IT Inventory" }

export default function Bc28DetailPage({ params }: PageProps<"/dokumen-bc/bc28/[id]">) {
  return <CustomsDocumentDetailPage spec={BC28} params={params} />
}
