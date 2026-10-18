import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC261 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.6.1 · IT Inventory" }

export default function Bc261RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc261/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC261} params={params} />
}
