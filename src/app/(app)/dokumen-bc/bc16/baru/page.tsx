import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC16 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 1.6 · IT Inventory" }

export default function NewBc16Page() {
  return <NewCustomsDocumentPage spec={BC16} />
}
