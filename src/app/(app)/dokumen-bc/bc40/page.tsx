import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC40 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 4.0 · IT Inventory" }

export default function Bc40Page({ searchParams }: PageProps<"/dokumen-bc/bc40">) {
  return <CustomsListPage spec={BC40} searchParams={searchParams} />
}
