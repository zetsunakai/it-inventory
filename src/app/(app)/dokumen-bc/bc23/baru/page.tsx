import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.3 · IT Inventory" }

export default function NewBc23Page() {
  return <NewCustomsDocumentPage spec={BC23} />
}
