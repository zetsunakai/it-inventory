import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DeleteRecord } from "@/components/delete-record"
import { ArchivedBadge, NameCell } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { recordActivity } from "@/server/queries/activity"
import { warehouseNeighbors } from "@/server/queries/neighbors"
import { LOCATION_TYPE_LABELS } from "@/lib/inventory"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  getWarehouseForUser,
  listWarehouseLocations,
  type LocationRow,
} from "@/server/queries/warehouses"

import { deleteWarehouse } from "../actions"
import { LocationCreateForm } from "../location-forms"
import { WarehouseForm } from "../warehouse-forms"
import { Section } from "@/components/layout/section"

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

  return (
    <DocumentLayout
      title={`${warehouse.code} · ${warehouse.name}`}
      crumbs={[{ label: warehouse.code }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="gudang" />}
      meta={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{warehouse.address}</span>
          {!warehouse.active && <ArchivedBadge />}
        </span>
      }
    >
      <Section title="Lokasi">
        <DataTable
          columns={LOCATION_COLUMNS}
          rows={locations}
          rowKey={(row) => row.id}
          rowHref={canEdit ? (row) => `/master/gudang/${warehouse.id}/lokasi/${row.id}` : undefined}
          rowMuted={(row) => !row.active}
          empty={{
            title: "Belum ada lokasi di gudang ini.",
            description: canEdit
              ? "Tambahkan lokasi di bawah supaya barang bisa diterima ke gudang ini."
              : "Barang belum bisa diterima ke gudang ini.",
          }}
        />
        {canEdit &&
          (warehouse.active ? (
            <LocationCreateForm warehouseId={warehouse.id} parents={parentOptions} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Gudang ini diarsipkan. Aktifkan lagi di Data gudang untuk menambah lokasi.
            </p>
          ))}
      </Section>

      {canEdit && (
        <Section title="Data gudang">
          <WarehouseForm warehouse={warehouse} />
        </Section>
      )}
      {canEdit && (
        <DeleteRecord
          action={deleteWarehouse}
          id={warehouse.id}
          noun="gudang"
          label={warehouse.code}
          listHref="/master/gudang"
        />
      )}
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
