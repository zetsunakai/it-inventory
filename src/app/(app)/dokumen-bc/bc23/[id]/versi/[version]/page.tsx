import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.3 · IT Inventory" }

export default function Bc23RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc23/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC23} params={params} />
}
