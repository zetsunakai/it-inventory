import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
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

function locationColumns(warehouseId: string, canEdit: boolean): DataTableColumn<LocationRow>[] {
  const columns: DataTableColumn<LocationRow>[] = [
    {
      header: "Kode",
      cell: (row) => (
        <span className="font-mono" style={{ paddingLeft: `${row.depth * 1.25}rem` }}>
          {row.code}
        </span>
      ),
    },
    { header: "Nama", cell: (row) => row.name, className: "whitespace-normal" },
    { header: "Jalur", cell: (row) => <span className="font-mono text-xs">{row.path}</span> },
    { header: "Tipe", cell: (row) => LOCATION_TYPE_LABELS[row.type] },
    {
      header: "Status",
      cell: (row) =>
        row.active ? (
          <Badge variant="secondary">Aktif</Badge>
        ) : (
          <Badge variant="outline">Arsip</Badge>
        ),
    },
  ]
  if (!canEdit) return columns
  return [
    ...columns,
    {
      header: "Aksi",
      className: "text-right",
      cell: (row) => (
        <Link
          href={`/master/gudang/${warehouseId}/lokasi/${row.id}`}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
          aria-label={`Ubah lokasi ${row.code}`}
        >
          Ubah
        </Link>
      ),
    },
  ]
}

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
          <>
            {INVENTORY_CATEGORY_LABELS[warehouse.category]} ·{" "}
            {warehouse.isBonded ? "Gudang berikat" : "Gudang non-berikat"}
            {!warehouse.active && " · Diarsipkan"}
          </>
        }
        actions={
          <Link href="/master/gudang" className={buttonVariants({ variant: "outline" })}>
            Kembali ke daftar
          </Link>
        }
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Data gudang</h2>
        {canEdit ? (
          <WarehouseForm warehouse={warehouse} />
        ) : (
          <dl className="grid max-w-2xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Alamat</dt>
            <dd>{warehouse.address}</dd>
          </dl>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Lokasi</h2>
        <DataTable
          columns={locationColumns(warehouse.id, canEdit)}
          rows={locations}
          rowKey={(row) => row.id}
          emptyMessage="Belum ada lokasi di gudang ini."
        />
        {canEdit && <LocationCreateForm warehouseId={warehouse.id} parents={parentOptions} />}
      </section>

      {canManageAccess && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Akses user</h2>
            <p className="text-sm text-muted-foreground">
              {ALL_WAREHOUSE_ROLES.map((role) => ROLE_LABELS[role]).join(", ")} otomatis bisa
              melihat semua gudang. Peran lain hanya melihat gudang yang diberikan di sini.
            </p>
          </div>
          <AccessManager warehouseId={warehouse.id} members={members} candidates={candidates} />
        </section>
      )}
    </div>
  )
}
