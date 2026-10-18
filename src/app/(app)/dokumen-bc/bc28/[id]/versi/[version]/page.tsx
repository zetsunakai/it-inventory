import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC28 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 2.8 · IT Inventory" }

export default function Bc28RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc28/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC28} params={params} />
}
