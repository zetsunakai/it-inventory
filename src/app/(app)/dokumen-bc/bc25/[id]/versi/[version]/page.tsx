import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC25 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.5 · IT Inventory" }

export default function Bc25RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc25/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC25} params={params} />
}
