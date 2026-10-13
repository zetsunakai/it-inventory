import type { Metadata } from "next"
import { Suspense } from "react"

import { ImportColumnGuide } from "@/components/import/import-column-guide"
import { ImportForm } from "@/components/import/import-form"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { PRODUCT_COLUMNS } from "@/server/master-io/products"

import { importProducts } from "../actions"

export const metadata: Metadata = { title: "Import produk · IT Inventory" }

export default function ImportProductsPage() {
  return (
    <>
      <PageHeader
        title="Import produk"
        description="SKU baru ditambahkan, SKU yang sudah ada diperbarui. Bila ada satu baris yang salah, tidak ada yang disimpan."
      />
      <Suspense fallback={<Skeleton className="h-40 w-full max-w-xl" />}>
        <Guarded />
      </Suspense>
      <ImportColumnGuide columns={PRODUCT_COLUMNS} />
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return (
    <ImportForm
      action={importProducts}
      noun="produk"
      keyLabel="SKU"
      listHref="/master/produk"
      exportHref="/master/produk/export?format=xlsx"
    />
  )
}
