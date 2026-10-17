import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC41 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 4.1 · IT Inventory" }

export default function Bc41Page({ searchParams }: PageProps<"/dokumen-bc/bc41">) {
  return <CustomsListPage spec={BC41} searchParams={searchParams} />
}
