import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC16 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 1.6 · IT Inventory" }

export default function Bc16RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc16/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC16} params={params} />
}
