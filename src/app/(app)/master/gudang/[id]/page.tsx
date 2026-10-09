import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { PageHeader } from "@/components/page-header"
import { ArchivedBadge, NameCell, StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { INVENTORY_CATEGORY_LABELS, LOCATION_TYPE_LABELS } from "@/lib/inventory"
import { ALL_WAREHOUSE_ROLES, hasPermission, ROLE_LABELS } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import {
  getWarehouseForUser,
  listAssignableUsers,
  listWarehouseLocations,
  listWarehouseUsers,
  type LocationRow,
} from "@/server/queries/warehouses"

import { AccessManager } from "../access-manager"
import { LocationCreateForm } from "../location-forms"
import { WarehouseForm } from "../warehouse-forms"

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
  { header: "Jalur", cell: (row) => <span className="font-mono text-xs">{row.path}</span> },
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
  const canManageAccess = hasPermission(user.roles, "user:manage")
  const [locations, members, candidates] = await Promise.all([
    listWarehouseLocations(warehouse.id),
    canManageAccess ? listWarehouseUsers(warehouse.id) : [],
    canManageAccess ? listAssignableUsers(warehouse.id) : [],
  ])
  const parentOptions = locations
    .filter((location) => location.active)
    .map((location) => ({ id: location.id, path: location.path }))

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${warehouse.code} · ${warehouse.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {warehouse.isBonded ? (
              <StatusBadge tone="bonded">Gudang berikat</StatusBadge>
            ) : (
              <span>Gudang non-berikat</span>
            )}
            <span>{INVENTORY_CATEGORY_LABELS[warehouse.category]}</span>
            <span>{warehouse.address}</span>
            {!warehouse.active && <ArchivedBadge />}
          </span>
        }
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Lokasi</h2>
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
        {canEdit && <LocationCreateForm warehouseId={warehouse.id} parents={parentOptions} />}
      </section>

      {canManageAccess && (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Akses user</h2>
            <p className="text-sm text-muted-foreground">
              {ALL_WAREHOUSE_ROLES.map((role) => ROLE_LABELS[role]).join(", ")} otomatis bisa
              melihat semua gudang. Peran lain hanya melihat gudang yang diberikan di sini.
            </p>
          </div>
          <AccessManager warehouseId={warehouse.id} members={members} candidates={candidates} />
        </section>
      )}
      {canEdit && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Data gudang</h2>
          <WarehouseForm warehouse={warehouse} />
        </section>
      )}
    </div>
  )
}
