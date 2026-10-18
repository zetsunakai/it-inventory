import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC27 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.7 · IT Inventory" }

export default function Bc27Page({ searchParams }: PageProps<"/dokumen-bc/bc27">) {
  return <CustomsListPage spec={BC27} searchParams={searchParams} />
}
