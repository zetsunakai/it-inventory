import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC33 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 3.3 · IT Inventory" }

export default function Bc33RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc33/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC33} params={params} />
}
