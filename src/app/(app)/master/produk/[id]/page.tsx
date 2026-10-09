import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDecimal } from "@/lib/decimal"
import { INVENTORY_CATEGORY_LABELS } from "@/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getProduct } from "@/server/queries/products"

import { missingCustomsData } from "../customs-readiness"
import { ProductForm } from "../product-form"

export const metadata: Metadata = { title: "Detail produk · IT Inventory" }

export default function ProductPage({ params }: PageProps<"/master/produk/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[32rem] w-full max-w-3xl" />}>
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

  const missing = missingCustomsData(product)
  const rows: [string, string][] = [
    ["Kategori IT Inventory", INVENTORY_CATEGORY_LABELS[product.category]],
    ["Satuan stok", `[${product.uom.code}] ${product.uom.name}`],
    ["Deskripsi", product.description ?? "—"],
    [
      "Merk / tipe / ukuran",
      [product.brand, product.model, product.size].map((v) => v ?? "—").join(" / "),
    ],
    [
      "Berat netto",
      product.netWeight ? `${formatDecimal(product.netWeight)} kg per ${product.uom.code}` : "—",
    ],
    ["Wajib lot", product.lotRequired ? "Ya" : "Tidak"],
    ["Kode HS", product.hs ? formatRefCode(product.hs) : (product.hsCode ?? "—")],
    [
      "Satuan CEISA",
      product.ceisaUnitCode && product.ceisaFactor
        ? `1 ${product.uom.code} = ${formatDecimal(product.ceisaFactor)} ${product.ceisaUnitCode}${product.ceisaUnit ? ` (${product.ceisaUnit.name})` : ""}`
        : "—",
    ],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${product.sku} · ${product.name}`}
        description={
          product.customsReady
            ? "Siap dipakai di dokumen BC."
            : `Belum siap dokumen BC: ${missing.join(" dan ")} belum diisi.`
        }
      />
      {hasPermission(user.roles, "master:write") ? (
        <ProductForm product={product} uoms={[]} />
      ) : (
        <dl className="grid max-w-3xl grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
