import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"
import { Skeleton } from "@/components/ui/skeleton"
import {
  INVENTORY_CATEGORY_LABELS,
  PRODUCT_TRACKING_LABELS,
} from "@/modules/inventory/lib/inventory"
import { skuExample } from "@/modules/inventory/lib/product-category"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { listProductCategoryOptions } from "@/modules/inventory/server/queries/product-categories"
import { getProduct } from "@/modules/inventory/server/queries/products"

import { ProductForm } from "../product-form"
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

  const canEdit = hasPermission(user.roles, "master:write")
  const view = (
    <>
      <ViewSection title="Data produk">
        <StaticField label="Nama produk" value={product.name} span={12} />
        <StaticField label="Product code" value={product.sku} mono />
        <StaticField label="Kategori produk" value={product.categoryPath ?? "—"} />
        <StaticField label="Deskripsi" value={product.description ?? "—"} span={12} />
        <StaticField
          label="Kategori IT Inventory"
          value={INVENTORY_CATEGORY_LABELS[product.category]}
        />
        <StaticField label="Satuan stok" value={`[${product.uom.code}] ${product.uom.name}`} />
        <StaticField label="Merk" value={product.brand ?? "—"} span={4} />
        <StaticField label="Tipe" value={product.model ?? "—"} span={4} />
        <StaticField label="Ukuran" value={product.size ?? "—"} span={4} />
        <StaticField label="Status" value={product.active ? "Aktif" : "Diarsipkan"} />
      </ViewSection>
      <ViewSection title="Lot dan nomor seri">
        <StaticField
          label="Pelacakan"
          value={`${PRODUCT_TRACKING_LABELS[product.tracking]}${product.lotAuto ? ` · nomor otomatis ${skuExample(`${product.sku}-`, product.lotDigits)}` : ""}`}
        />
      </ViewSection>
      <ViewSection title="Data kepabeanan">
        <StaticField
          label="Kode HS"
          value={product.hs ? formatRefCode(product.hs) : (product.hsCode ?? "—")}
          span={12}
        />
      </ViewSection>
    </>
  )

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
      <RecordModes
        key={product.id}
        canEdit={canEdit}
        createHref="/master/produk/baru"
        view={view}
        form={
          canEdit && (
            <ProductForm
              product={product}
              uoms={[]}
              categories={await listProductCategoryOptions(product.categoryId)}
            />
          )
        }
      />
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
