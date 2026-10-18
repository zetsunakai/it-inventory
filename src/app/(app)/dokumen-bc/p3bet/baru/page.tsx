import type { Metadata } from "next"

import { NewCustomsDocumentPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { P3BET } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Buat P3BET · IT Inventory" }

export default function NewP3betPage() {
  return <NewCustomsDocumentPage spec={P3BET} />
}
