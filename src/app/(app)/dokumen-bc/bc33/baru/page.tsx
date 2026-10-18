import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC33 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 3.3 · IT Inventory" }

export default function NewBc33Page() {
  return <NewCustomsDocumentPage spec={BC33} />
}
