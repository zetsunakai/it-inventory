import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC33 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 3.3 · IT Inventory" }

export default function Bc33Page({ searchParams }: PageProps<"/dokumen-bc/bc33">) {
  return <CustomsListPage spec={BC33} searchParams={searchParams} />
}
