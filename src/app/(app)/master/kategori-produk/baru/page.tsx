import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/modules/inventory/server/queries/product-categories"

import { ProductCategoryForm } from "../category-form"

export const metadata: Metadata = { title: "Tambah kategori produk · IT Inventory" }

export default function NewProductCategoryPage() {
  return (
    <NewRecordLayout title="Tambah kategori produk" noun="kategori produk">
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <ProductCategoryForm parents={await listProductCategoryOptions()} />
}
