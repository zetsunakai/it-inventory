import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC25 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.5 · IT Inventory" }

export default function Bc25Page({ searchParams }: PageProps<"/dokumen-bc/bc25">) {
  return <CustomsListPage spec={BC25} searchParams={searchParams} />
}
