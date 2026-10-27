import type { Metadata } from "next"
import { Suspense } from "react"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { LOCATION_COLUMNS } from "@/modules/inventory/server/master-io/locations"

import { importLocations } from "@/modules/inventory/actions/warehouses"

export const metadata: Metadata = { title: "Import lokasi · IT Inventory" }

export default function ImportLocationsPage() {
  return (
    <DocumentLayout
      crumbs={[{ label: "Gudang & lokasi", href: "/master/gudang" }, { label: "Import" }]}
      title="Import lokasi"
      meta="Lokasi untuk semua gudang dalam satu file. Kode baru ditambahkan, kode yang sudah ada diperbarui. Bila ada satu baris yang salah, tidak ada yang disimpan."
    >
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Guarded />
      </Suspense>
      <ImportColumnGuide columns={LOCATION_COLUMNS} />
    </DocumentLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return (
    <ImportForm
      action={importLocations}
      noun="lokasi"
      keyLabel="Kode"
      listHref="/master/gudang"
      exportHref="/master/gudang/lokasi/export?format=xlsx"
    />
  )
}
