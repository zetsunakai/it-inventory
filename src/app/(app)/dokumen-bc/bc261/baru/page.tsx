import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC261 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.6.1 · IT Inventory" }

export default function NewBc261Page() {
  return <NewCustomsDocumentPage spec={BC261} />
}
