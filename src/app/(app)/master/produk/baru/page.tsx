import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/server/queries/product-categories"
import { listActiveUoms } from "@/server/queries/products"

import { ProductForm } from "../product-form"

export const metadata: Metadata = { title: "Tambah produk · IT Inventory" }

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title="Tambah produk"
        description="Product code dan satuan stok tidak bisa diubah setelah disimpan. Product code boleh dikosongkan bila kategori produknya punya prefix kode."
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  const [uoms, categories] = await Promise.all([listActiveUoms(), listProductCategoryOptions()])
  return <ProductForm uoms={uoms} categories={categories} />
}
