import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { formatNumber } from "@/lib/format"
import { requirePermission } from "@/server/auth/session"
import { getProductCategory, listProductCategoryOptions } from "@/server/queries/product-categories"
import { recordActivity } from "@/server/queries/activity"
import { productCategoryNeighbors } from "@/server/queries/neighbors"

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
  const [neighbors, activity] = await Promise.all([
    productCategoryNeighbors(category.path),
    recordActivity("product_categories", category.id, CATEGORY_ACTIVITY_LABELS),
  ])

  return (
    <DocumentLayout
      title={category.path}
      meta={`${formatNumber(category.productCount)} produk, ${formatNumber(category.childCount)} sub-kategori. Prefix kode hanya berlaku untuk SKU produk baru.`}
      crumbs={[{ label: category.path }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="kategori produk" />}
    >
      <ProductCategoryForm category={category} parents={parents} />
      <DeleteRecord
        action={deleteProductCategory}
        id={category.id}
        noun="kategori produk"
        label={category.name}
        listHref="/master/kategori-produk"
      />
    </DocumentLayout>
  )
}

const CATEGORY_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    parent_id: "Induk kategori",
    code_prefix: "Prefix kode",
    code_digits: "Jumlah digit kode",
    active: "Aktif",
  },
}
