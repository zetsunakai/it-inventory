import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC262 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.6.2 · IT Inventory" }

export default function NewBc262Page() {
  return <NewCustomsDocumentPage spec={BC262} />
}
