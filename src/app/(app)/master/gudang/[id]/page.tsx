import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { RelationalView } from "@/components/relational/relational-view"
import { relationColumns } from "@/components/relational/columns"
import { WAREHOUSE_LOCATION_FIELDS } from "../warehouse-location-columns"
import Link from "next/link"
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

const LOCATION_COLUMNS = relationColumns<LocationRow>(WAREHOUSE_LOCATION_FIELDS, [
  {
    id: "code",
    label: "Kode",
    required: true,
    value: (row) => row.code,
    render: (row) => (
      <Link
        href={`/master/gudang/${row.warehouseId}/lokasi/${row.id}`}
        className="font-mono text-primary hover:underline"
      >
        {row.code}
      </Link>
    ),
  },
  {
    id: "name",
    label: "Nama",
    required: true,
    value: (row) => row.name,
    render: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
  },
  { id: "type", label: "Tipe", value: (row) => LOCATION_TYPE_LABELS[row.type] },
  {
    id: "parent",
    label: "Lokasi induk",
    value: (row) => row.path.split("/").at(-2) || "Tanpa induk",
  },
  { id: "path", label: "Jalur", value: (row) => row.path },
  { id: "active", label: "Aktif", value: (row) => (row.active ? "Ya" : "Tidak") },
])

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
  const locationsView = (
    <Section title="Lokasi">
      <RelationalView
        id="warehouse-locations"
        label="Lokasi"
        columns={LOCATION_COLUMNS.map((column) =>
          column.id === "code" && !canEdit ? { ...column, render: undefined } : column,
        )}
        rows={locations}
        rowKey={(row) => row.id}
      />
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
            {locationsView}
          </>
        }
        form={
          canEdit && (
            <WarehouseForm
              warehouse={warehouse}
              initialLocations={locations.map((row) => ({
                id: row.id,
                isNew: false,
                code: row.code,
                name: row.name,
                type: row.type,
                parentId: row.parentId,
                active: row.active,
              }))}
            />
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
