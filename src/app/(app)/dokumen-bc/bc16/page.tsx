import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC16 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 1.6 · IT Inventory" }

export default function Bc16Page({ searchParams }: PageProps<"/dokumen-bc/bc16">) {
  return <CustomsListPage spec={BC16} searchParams={searchParams} />
}
