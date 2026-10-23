import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"
import { ArchivedBadge, NameCell } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { recordActivity } from "@/server/queries/activity"
import { warehouseNeighbors } from "@/server/queries/neighbors"
import { LOCATION_TYPE_LABELS } from "@/modules/inventory/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  getWarehouseForUser,
  listWarehouseLocations,
  type LocationRow,
} from "@/modules/inventory/server/queries/warehouses"

import { deleteLocation } from "../actions"
import { LocationCreateForm } from "../location-forms"
import { WarehouseForm } from "../warehouse-forms"
import { Section } from "@/components/layout/section"
import { FrozenWarehouseBanner } from "@/modules/inventory/components/frozen-warehouse-banner"

export const metadata: Metadata = { title: "Detail gudang · IT Inventory" }

export default function WarehousePage({ params }: PageProps<"/master/gudang/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <WarehouseDetail params={params} />
    </Suspense>
  )
}

const LOCATION_COLUMNS: DataTableColumn<LocationRow>[] = [
  {
    header: "Kode",
    cell: (row) => (
      <span className="font-mono text-foreground" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
        {row.code}
      </span>
    ),
  },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  { header: "Jalur", cell: (row) => <span className="font-mono text-caption">{row.path}</span> },
  { header: "Tipe", cell: (row) => LOCATION_TYPE_LABELS[row.type] },
]

async function WarehouseDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("master:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  // Gudang yang tidak boleh dilihat diperlakukan seperti tidak ada.
  const warehouse = await getWarehouseForUser(user.id, id)
  if (!warehouse) notFound()

  const canEdit = hasPermission(user.roles, "master:write")
  const [locations, neighbors, activity] = await Promise.all([
    listWarehouseLocations(warehouse.id),
    warehouseNeighbors(user.id, warehouse.code),
    recordActivity("warehouses", warehouse.id, WAREHOUSE_ACTIVITY_LABELS),
  ])
  const parentOptions = locations
    .filter((location) => location.active)
    .map((location) => ({ id: location.id, path: location.path }))

  // Lokasi mengikuti mode record induk; navigasi detail tetap tersedia saat mode baca.
  const renderLocations = (editing: boolean) => (
    <Section title="Lokasi">
      <DataTable
        columns={LOCATION_COLUMNS}
        rows={locations}
        rowKey={(row) => row.id}
        rowHref={canEdit ? (row) => `/master/gudang/${warehouse.id}/lokasi/${row.id}` : undefined}
        rowMuted={(row) => !row.active}
        selection={
          canEdit && editing
            ? {
                remove: deleteLocation,
                noun: "lokasi",
                id: (row) => row.id,
                label: (row) => row.code,
              }
            : undefined
        }
        empty={{
          title: "Belum ada lokasi di gudang ini.",
          description: canEdit
            ? editing
              ? "Tambahkan lokasi di bawah supaya barang bisa diterima ke gudang ini."
              : "Klik Edit untuk menambahkan lokasi agar barang bisa diterima ke gudang ini."
            : "Barang belum bisa diterima ke gudang ini.",
        }}
      />
      {canEdit &&
        editing &&
        (warehouse.active ? (
          <LocationCreateForm warehouseId={warehouse.id} parents={parentOptions} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Gudang ini diarsipkan. Aktifkan lagi di Data gudang untuk menambah lokasi.
          </p>
        ))}
    </Section>
  )

  return (
    <DocumentLayout
      title={`${warehouse.code} · ${warehouse.name}`}
      crumbs={[{ label: warehouse.code }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="gudang" />}
      meta={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="whitespace-pre-wrap">{warehouse.address}</span>
          {!warehouse.active && <ArchivedBadge />}
        </span>
      }
    >
      <FrozenWarehouseBanner warehouseIds={[warehouse.id]} context="warehouse" />
      <RecordModes
        key={warehouse.id}
        canEdit={canEdit}
        createHref="/master/gudang/baru"
        view={
          <>
            <ViewSection title="Data gudang">
              <StaticField label="Kode gudang" value={warehouse.code} mono span={6} />
              <StaticField label="Nama gudang" value={warehouse.name} span={6} />
              <StaticField multiline label="Alamat" value={warehouse.address} span={6} />
              <StaticField
                label="Lokasi stok utama"
                value={
                  locations.find((location) => location.id === warehouse.stockLocationId)?.path ??
                  "Belum dipilih"
                }
                mono={Boolean(warehouse.stockLocationId)}
              />
              <StaticField label="Status" value={warehouse.active ? "Aktif" : "Diarsipkan"} />
            </ViewSection>
            {renderLocations(false)}
          </>
        }
        form={
          canEdit && (
            <>
              <WarehouseForm
                warehouse={warehouse}
                stockLocations={locations
                  .filter(
                    (location) =>
                      location.type === "internal" &&
                      (location.active || location.id === warehouse.stockLocationId),
                  )
                  .map((location) => ({ id: location.id, path: location.path }))}
              />
              {renderLocations(true)}
            </>
          )
        }
      />
    </DocumentLayout>
  )
}

const WAREHOUSE_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    address: "Alamat",
    active: "Aktif",
  },
}
