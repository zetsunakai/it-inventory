import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { Skeleton } from "@/components/ui/skeleton"
import { INVENTORY_CATEGORY_LABELS, PRODUCT_TRACKING_LABELS } from "@/lib/inventory"
import { skuExample } from "@/lib/product-category"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/server/queries/product-categories"
import { getProduct } from "@/server/queries/products"

import { deleteProduct } from "../actions"
import { ProductForm } from "../product-form"
import { InfoGrid } from "@/components/layout/info-grid"
import { recordActivity } from "@/server/queries/activity"
import { masterNeighbors } from "@/server/queries/neighbors"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"

export const metadata: Metadata = { title: "Detail produk · IT Inventory" }

export default function ProductPage({ params }: PageProps<"/master/produk/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-4xl" />}>
      <ProductDetail params={params} />
    </Suspense>
  )
}

async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("master:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const product = await getProduct(id)
  if (!product) notFound()
  const [neighbors, activity] = await Promise.all([
    masterNeighbors("products", product.sku),
    recordActivity("products", product.id, PRODUCT_ACTIVITY_LABELS),
  ])

  const rows: [string, string][] = [
    ["Product code", product.sku],
    ["Nama produk", product.name],
    ["Kategori produk", product.categoryPath ?? "—"],
    ["Kategori IT Inventory", INVENTORY_CATEGORY_LABELS[product.category]],
    ["Satuan stok", `[${product.uom.code}] ${product.uom.name}`],
    ["Deskripsi", product.description ?? "—"],
    [
      "Merk / tipe / ukuran",
      [product.brand, product.model, product.size].map((v) => v ?? "—").join(" / "),
    ],
    [
      "Pelacakan",
      `${PRODUCT_TRACKING_LABELS[product.tracking]}${product.lotAuto ? ` · nomor otomatis ${skuExample(`${product.sku}-`, product.lotDigits)}` : ""}`,
    ],
    ["Kode HS", product.hs ? formatRefCode(product.hs) : (product.hsCode ?? "—")],
  ]

  return (
    <DocumentLayout
      title={`${product.sku} · ${product.name}`}
      crumbs={[{ label: product.sku }]}
      meta={
        product.customsReady
          ? "Siap dipakai di dokumen BC."
          : "Belum siap dokumen BC: kode HS belum diisi."
      }

      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="produk" />}
    >
      {hasPermission(user.roles, "master:write") ? (
        <>
          <ProductForm
            product={product}
            uoms={[]}
            categories={await listProductCategoryOptions(product.categoryId)}
          />
          <DeleteRecord
            action={deleteProduct}
            id={product.id}
            noun="produk"
            label={product.sku}
            listHref="/master/produk"
          />
        </>
      ) : (
        <InfoGrid
          items={rows.map(([label, value]) => ({
            label,
            value,
            wide: label === "Alamat" || label === "Deskripsi" || label === "Catatan",
          }))}
        />
      )}
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const PRODUCT_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    description: "Deskripsi",
    category: "Kategori IT Inventory",
    category_id: "Kategori produk",
    hs_code: "Kode HS",
    brand: "Merk",
    model: "Tipe",
    size: "Ukuran",
    tracking: "Pelacakan",
    lot_auto: "Nomor lot/seri otomatis",
    active: "Aktif",
  },
  values: {
    category: INVENTORY_CATEGORY_LABELS as Record<string, string>,
    tracking: PRODUCT_TRACKING_LABELS as Record<string, string>,
  },
}
