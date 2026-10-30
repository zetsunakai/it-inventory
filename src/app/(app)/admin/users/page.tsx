import type { Metadata } from "next"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { ListLayout } from "@/components/layout/list-layout"
import { NameCell, StatusBadge } from "@/components/status-badge"
import { formatDate } from "@/lib/format"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { ROLE_LABELS, ROLES } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listUsers, type UserListRow } from "@/server/queries/users"
import { ListToolbar } from "@/components/layout/list-toolbar"
import { ListSearchBar } from "@/components/data-table/list-search-bar"
import { USER_LIST_FIELDS } from "@/server/queries/users"
import { ListPager } from "@/components/data-table/list-pager"

export const metadata: Metadata = { title: "Pengguna · IT Inventory" }

const ROLE_FILTER = "peran"

const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))

const COLUMNS: DataTableColumn<UserListRow>[] = [
  { header: "Nama", cell: (user) => <NameCell>{user.name}</NameCell> },
  { header: "Email", cell: (user) => user.email, className: "w-full" },
  {
    header: "Peran",
    cell: (user) =>
      user.roles.length ? (
        user.roles.map((role) => ROLE_LABELS[role]).join(", ")
      ) : (
        <StatusBadge tone="warning">Belum punya peran</StatusBadge>
      ),
  },
  {
    header: "MFA",
    cell: (user) =>
      user.twoFactorEnabled ? (
        <StatusBadge tone="success">Aktif</StatusBadge>
      ) : (
        <span className="text-muted-foreground">Tidak aktif</span>
      ),
  },
  { header: "Dibuat", cell: (user) => formatDate(user.createdAt), align: "right" },
]

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <ListLayout title="Pengguna">
      <Suspense fallback={<DataTableSkeleton />}>
        <UserTable searchParams={searchParams} />
      </Suspense>
    </ListLayout>
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
      <ListToolbar
        pager={
          <ListPager
            searchParams={raw}
            page={params.page}
            pageSize={params.pageSize}
            total={total}
          />
        }
      >
        <ListSearchBar
          fields={USER_LIST_FIELDS}
          placeholder="Cari nama atau email"
          filters={[{ name: ROLE_FILTER, label: "Peran", options: ROLE_OPTIONS }]}
        />
      </ListToolbar>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(user) => user.id}
        rowHref={(user) => `/admin/users/${user.id}`}
        empty={listEmptyState({ searchParams: raw, noun: "user" })}
      />
    </div>
  )
}
