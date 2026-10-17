import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC25 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.5 · IT Inventory" }

export default function NewBc25Page() {
  return <NewCustomsDocumentPage spec={BC25} />
}
