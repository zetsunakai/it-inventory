import type { Metadata } from "next"

import { CustomsListPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { P3BET } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "P3BET · IT Inventory" }

export default function P3betPage({ searchParams }: PageProps<"/dokumen-bc/p3bet">) {
  return <CustomsListPage spec={P3BET} searchParams={searchParams} />
}
