import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC262 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.6.2 · IT Inventory" }

export default function Bc262Page({ searchParams }: PageProps<"/dokumen-bc/bc262">) {
  return <CustomsListPage spec={BC262} searchParams={searchParams} />
}
