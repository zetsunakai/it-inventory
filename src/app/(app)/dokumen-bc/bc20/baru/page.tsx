import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC20 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.0 · IT Inventory" }

export default function NewBc20Page() {
  return <NewCustomsDocumentPage spec={BC20} />
}
