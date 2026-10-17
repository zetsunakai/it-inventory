import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.3 · IT Inventory" }

export default function Bc23Page({ searchParams }: PageProps<"/dokumen-bc/bc23">) {
  return <CustomsListPage spec={BC23} searchParams={searchParams} />
}
