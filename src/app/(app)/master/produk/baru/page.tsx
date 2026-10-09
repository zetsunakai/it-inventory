import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { listActiveUoms } from "@/server/queries/products"

import { ProductForm } from "../product-form"

export const metadata: Metadata = { title: "Tambah produk · IT Inventory" }

export default function NewProductPage() {
  return (
    <>
      <PageHeader
        title="Tambah produk"
        description="SKU dan satuan stok tidak bisa diubah setelah disimpan."
      />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-3xl" />}>
        <Guarded />
      </Suspense>
    </>
  )
}

async function Guarded() {
  await requirePermission("master:write")
  return <ProductForm uoms={await listActiveUoms()} />
}
