import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC27 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.7 · IT Inventory" }

export default function Bc27RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc27/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC27} params={params} />
}
