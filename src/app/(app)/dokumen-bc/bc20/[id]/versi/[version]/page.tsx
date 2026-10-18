import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC20 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.0 · IT Inventory" }

export default function Bc20RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc20/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC20} params={params} />
}
