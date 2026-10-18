import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { P3BET } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama P3BET · IT Inventory" }

export default function P3betRevisionPage({
  params,
}: PageProps<"/dokumen-bc/p3bet/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={P3BET} params={params} />
}
