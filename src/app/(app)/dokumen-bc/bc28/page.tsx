import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC28 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "BC 2.8 · IT Inventory" }

export default function Bc28Page({ searchParams }: PageProps<"/dokumen-bc/bc28">) {
  return <CustomsListPage spec={BC28} searchParams={searchParams} />
}
