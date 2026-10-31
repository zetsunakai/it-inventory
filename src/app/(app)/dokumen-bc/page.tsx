import type { Metadata } from "next"

import { AllCustomsDocumentsPage } from "@/modules/it-inventory/components/customs/all-customs-documents-page"

export const metadata: Metadata = { title: "Daftar dokumen · IT Inventory" }

export default function DocumentsPage({ searchParams }: PageProps<"/dokumen-bc">) {
  return <AllCustomsDocumentsPage searchParams={searchParams} />
}
