import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { formatDate } from "@/lib/format"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { ROLE_LABELS, ROLES } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listUsers, type UserListRow } from "@/server/queries/users"

export const metadata: Metadata = { title: "Pengguna · IT Inventory" }

const ROLE_FILTER = "peran"

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))

const COLUMNS: DataTableColumn<UserListRow>[] = [
  { header: "Nama", cell: (user) => <span className="font-medium">{user.name}</span> },
  { header: "Email", cell: (user) => user.email },
  {
    header: "Peran",
    cell: (user) =>
      user.roles.length ? (
        <div className="flex flex-wrap gap-1">
          {user.roles.map((role) => (
            <Badge key={role} variant="secondary">
              {ROLE_LABELS[role]}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-muted-foreground">Belum punya peran</span>
      ),
  },
  {
    header: "MFA",
    cell: (user) =>
      user.twoFactorEnabled ? <Badge>Aktif</Badge> : <Badge variant="outline">Belum aktif</Badge>,
  },
  { header: "Dibuat", cell: (user) => formatDate(user.createdAt), className: "text-right" },
]

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader title="Pengguna" description="Daftar user dan perannya." />
      <Suspense fallback={<DataTableSkeleton />}>
        <UserTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function UserTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  await requirePermission("user:manage")
  const raw = await searchParams
  const params = parseListParams(raw)
  const role = pickFilter(raw, ROLE_FILTER, ROLES)
  const { rows, total } = await listUsers({ ...params, role })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari nama atau email" />
        <DataTableFilter name={ROLE_FILTER} label="Peran" options={ROLE_OPTIONS} />
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(user) => user.id}
        emptyMessage="Tidak ada user yang cocok."
      />
      <DataTablePagination
        searchParams={raw}
        page={params.page}
        pageSize={params.pageSize}
        total={total}
      />
    </div>
  )
}
