import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC30 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 3.0 · IT Inventory" }

export default function NewBc30Page() {
  return <NewCustomsDocumentPage spec={BC30} />
}
