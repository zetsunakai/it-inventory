import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/modules/inventory/server/queries/product-categories"

import { ProductCategoryForm } from "../category-form"

export const metadata: Metadata = { title: "Tambah kategori produk · IT Inventory" }

export default function NewProductCategoryPage() {
  return (
    <>
      <PageHeader title="Tambah kategori produk" />
      <Suspense fallback={<Skeleton className="h-72 w-full max-w-4xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <ProductCategoryForm parents={await listProductCategoryOptions()} />
}
