import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LOCATION_TYPE_LABELS } from "@/lib/inventory"
import { requirePermission } from "@/server/auth/session"
import {
  getLocation,
  getWarehouseForUser,
  listWarehouseLocations,
} from "@/server/queries/warehouses"

import { LocationEditForm } from "../../../location-forms"

export const metadata: Metadata = { title: "Ubah lokasi · IT Inventory" }

export default function EditLocationPage({
  params,
}: PageProps<"/master/gudang/[id]/lokasi/[lokasiId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full max-w-2xl" />}>
      <EditLocation params={params} />
    </Suspense>
  )
}

async function EditLocation({ params }: { params: Promise<{ id: string; lokasiId: string }> }) {
  const user = await requirePermission("master:write")
  const { id, lokasiId } = await params
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(lokasiId).success) notFound()

  const [warehouse, location] = await Promise.all([
    getWarehouseForUser(user.id, id),
    getLocation(lokasiId),
  ])
  if (!warehouse || !location || location.warehouseId !== warehouse.id) notFound()

  // Induk yang bisa dipilih: lokasi aktif lain di gudang ini, kecuali lokasi ini sendiri
  // dan turunannya (database juga menolak lingkaran).
  const parents = (await listWarehouseLocations(warehouse.id))
    .filter(
      (option) =>
        option.active && option.id !== location.id && !option.path.startsWith(`${location.path}/`),
    )
    .map((option) => ({ id: option.id, path: option.path }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Ubah lokasi ${location.code}`}
        description={`${warehouse.code} · ${LOCATION_TYPE_LABELS[location.type]} · kode, tipe, dan gudang tidak bisa diubah.`}
        actions={
          <Link
            href={`/master/gudang/${warehouse.id}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Kembali ke gudang
          </Link>
        }
      />
      <LocationEditForm location={location} parents={parents} />
    </div>
  )
}
