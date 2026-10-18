import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC20 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.0 · IT Inventory" }

export default function Bc20Page({ searchParams }: PageProps<"/dokumen-bc/bc20">) {
  return <CustomsListPage spec={BC20} searchParams={searchParams} />
}
