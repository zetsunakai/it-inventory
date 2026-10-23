import type { Metadata } from "next"
import { Suspense } from "react"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { PRODUCT_COLUMNS } from "@/modules/it-inventory/server/master-io/products"

import { importProducts } from "../actions"

export const metadata: Metadata = { title: "Import produk · IT Inventory" }

export default function ImportProductsPage() {
  return (
    <DocumentLayout
      crumbs={[{ label: "Produk", href: "/master/produk" }, { label: "Import" }]}
      title="Import produk"
      meta="Product code baru ditambahkan, product code yang sudah ada diperbarui. Bila ada satu baris yang salah, tidak ada yang disimpan."
    >
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Guarded />
      </Suspense>
      <ImportColumnGuide columns={PRODUCT_COLUMNS} />
    </DocumentLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return (
    <ImportForm
      action={importProducts}
      noun="produk"
      keyLabel="Product code"
      listHref="/master/produk"
      exportHref="/master/produk/export?format=xlsx"
    />
  )
}
