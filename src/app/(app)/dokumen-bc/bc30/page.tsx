import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC30 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 3.0 · IT Inventory" }

export default function Bc30Page({ searchParams }: PageProps<"/dokumen-bc/bc30">) {
  return <CustomsListPage spec={BC30} searchParams={searchParams} />
}
