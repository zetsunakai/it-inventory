import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { LOCATION_TYPE_LABELS } from "@/modules/inventory/lib/inventory"
import { requirePermission } from "@/server/auth/session"
import {
  getLocation,
  getWarehouseForUser,
  listWarehouseLocations,
} from "@/modules/inventory/server/queries/warehouses"
import { recordActivity } from "@/server/queries/activity"
import { locationNeighbors } from "@/server/queries/neighbors"

import { LocationEditForm } from "../../../location-forms"

export const metadata: Metadata = { title: "Ubah lokasi · IT Inventory" }

export default function EditLocationPage({
  params,
}: PageProps<"/master/gudang/[id]/lokasi/[lokasiId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-80 w-full max-w-4xl" />}>
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
        (option.active || option.id === location.parentId) &&
        option.id !== location.id &&
        !option.path.startsWith(`${location.path}/`),
    )
    .map((option) => ({ id: option.id, path: option.path }))
  const [neighbors, activity] = await Promise.all([
    locationNeighbors(warehouse.id, location.path),
    recordActivity("locations", location.id, LOCATION_ACTIVITY_LABELS),
  ])

  return (
    <DocumentLayout
      title={`${location.code} · ${location.name}`}
      crumbs={[
        { label: warehouse.code, href: `/master/gudang/${warehouse.id}` },
        { label: `Lokasi ${location.code}` },
      ]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="lokasi" />}
      meta={
        <>
          Lokasi {LOCATION_TYPE_LABELS[location.type].toLowerCase()} di gudang{" "}
          <Link
            href={`/master/gudang/${warehouse.id}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {warehouse.code} · {warehouse.name}
          </Link>
          . Kode, tipe, dan gudang tidak bisa diubah.
        </>
      }
    >
      <RecordModes
        key={location.id}
        canEdit
        view={
          <ViewSection title="Data lokasi">
            <StaticField label="Nama lokasi" value={location.name} />
            <StaticField
              label="Lokasi induk"
              value={
                parents.find((option) => option.id === location.parentId)?.path ??
                "Tanpa induk (langsung di bawah gudang)"
              }
            />
            <StaticField label="Status" value={location.active ? "Aktif" : "Diarsipkan"} />
          </ViewSection>
        }
        form={<LocationEditForm location={location} parents={parents} />}
      />
    </DocumentLayout>
  )
}

const LOCATION_ACTIVITY_LABELS = {
  fields: { name: "Nama", parent_id: "Lokasi induk", active: "Aktif" },
  values: { type: LOCATION_TYPE_LABELS as Record<string, string> },
}
