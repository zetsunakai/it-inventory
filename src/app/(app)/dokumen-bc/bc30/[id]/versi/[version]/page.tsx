import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC30 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 3.0 · IT Inventory" }

export default function Bc30RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc30/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC30} params={params} />
}
