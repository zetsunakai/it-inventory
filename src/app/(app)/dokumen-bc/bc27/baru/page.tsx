import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC27 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.7 · IT Inventory" }

export default function NewBc27Page() {
  return <NewCustomsDocumentPage spec={BC27} />
}
