import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC41 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail BC 4.1 · IT Inventory" }

export default function Bc41DetailPage({ params }: PageProps<"/dokumen-bc/bc41/[id]">) {
  return <CustomsDocumentDetailPage spec={BC41} params={params} />
}
