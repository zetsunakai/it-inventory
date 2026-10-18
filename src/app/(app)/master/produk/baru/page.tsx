import type { Metadata } from "next"
import { Suspense } from "react"

import { NewRecordLayout } from "@/components/document/new-record-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/modules/inventory/server/queries/product-categories"
import { listActiveUoms } from "@/modules/inventory/server/queries/products"

import { ProductForm } from "../product-form"

export const metadata: Metadata = { title: "Tambah produk · IT Inventory" }

export default function NewProductPage() {
  return (
    <NewRecordLayout
      title="Tambah produk"
      description="Product code dan satuan stok tidak bisa diubah setelah disimpan. Product code boleh dikosongkan bila kategori produknya punya prefix kode."
      noun="produk"
    >
      <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
        <Guarded />
      </Suspense>
    </NewRecordLayout>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  const [uoms, categories] = await Promise.all([listActiveUoms(), listProductCategoryOptions()])
  return <ProductForm uoms={uoms} categories={categories} />
}
