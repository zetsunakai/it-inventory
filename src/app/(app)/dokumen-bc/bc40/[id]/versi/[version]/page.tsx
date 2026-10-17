import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC40 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 4.0 · IT Inventory" }

export default function Bc40RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc40/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC40} params={params} />
}
