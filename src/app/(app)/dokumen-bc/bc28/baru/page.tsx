import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC28 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat BC 2.8 · IT Inventory" }

export default function NewBc28Page() {
  return <NewCustomsDocumentPage spec={BC28} />
}
