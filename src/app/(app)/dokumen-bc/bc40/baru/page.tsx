import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC40 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 4.0 · IT Inventory" }

export default function NewBc40Page() {
  return <NewCustomsDocumentPage spec={BC40} />
}
