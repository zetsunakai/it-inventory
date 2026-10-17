import type { Metadata } from "next"

import { CustomsRevisionPage } from "@/modules/it-inventory/components/customs/customs-document-pages"
import { BC41 } from "@/modules/it-inventory/lib/customs-specs"

export const metadata: Metadata = { title: "Versi lama BC 4.1 · IT Inventory" }

export default function Bc41RevisionPage({
  params,
}: PageProps<"/dokumen-bc/bc41/[id]/versi/[version]">) {
  return <CustomsRevisionPage spec={BC41} params={params} />
}
