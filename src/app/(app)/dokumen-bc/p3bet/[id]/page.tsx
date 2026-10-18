import type { Metadata } from "next"

import { CustomsDocumentDetailPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { P3BET } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Detail P3BET · IT Inventory" }

export default function P3betDetailPage({ params }: PageProps<"/dokumen-bc/p3bet/[id]">) {
  return <CustomsDocumentDetailPage spec={P3BET} params={params} />
}
