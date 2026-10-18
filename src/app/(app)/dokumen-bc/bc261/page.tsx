import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC261 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.6.1 · IT Inventory" }

export default function Bc261Page({ searchParams }: PageProps<"/dokumen-bc/bc261">) {
  return <CustomsListPage spec={BC261} searchParams={searchParams} />
}
