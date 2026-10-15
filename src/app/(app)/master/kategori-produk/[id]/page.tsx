import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { requirePermission } from "@/server/auth/session"
import { getProductCategory, listProductCategoryOptions } from "@/server/queries/product-categories"

import { deleteProductCategory } from "../actions"
import { ProductCategoryForm } from "../category-form"

export const metadata: Metadata = { title: "Ubah kategori produk · IT Inventory" }

export default function EditProductCategoryPage({
  params,
}: PageProps<"/master/kategori-produk/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-4xl" />}>
      <EditCategory params={params} />
    </Suspense>
  )
}

async function EditCategory({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("master:write")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const category = await getProductCategory(id)
  if (!category) notFound()
  // Kategori ini dan sub-kategorinya tidak bisa menjadi induknya sendiri.
  const parents = (await listProductCategoryOptions(category.parentId)).filter(
    (option) => option.path !== category.path && !option.path.startsWith(`${category.path} / `),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={category.path}
        description={`${formatNumber(category.productCount)} produk, ${formatNumber(category.childCount)} sub-kategori. Prefix kode hanya berlaku untuk SKU produk baru.`}
      />
      <ProductCategoryForm category={category} parents={parents} />
      <DeleteRecord
        action={deleteProductCategory}
        id={category.id}
        noun="kategori produk"
        label={category.name}
        listHref="/master/kategori-produk"
      />
    </div>
  )
}
