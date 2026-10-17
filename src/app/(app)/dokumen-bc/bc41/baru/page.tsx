import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC41 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 4.1 · IT Inventory" }

export default function NewBc41Page() {
  return <NewCustomsDocumentPage spec={BC41} />
}
