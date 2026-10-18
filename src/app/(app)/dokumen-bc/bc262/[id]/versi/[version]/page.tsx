import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC262 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.6.2 · IT Inventory" }

export default function Bc262RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc262/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC262} params={params} />
}
