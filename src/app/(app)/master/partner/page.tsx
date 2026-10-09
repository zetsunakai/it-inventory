import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listEmptyState } from "@/components/data-table/empty-state"
import { PageHeader } from "@/components/page-header"
import { NameCell } from "@/components/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { parseListParams, pickFilter, type RawSearchParams } from "@/lib/list-params"
import { IDENTITY_TYPE_LABELS } from "@/lib/partner"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { listPartners, type PartnerRow } from "@/server/queries/partners"

export const metadata: Metadata = { title: "Partner · IT Inventory" }

const ROLE_FILTER = "peran"
const ROLE_OPTIONS = [
  { value: "vendor", label: "Vendor" },
  { value: "customer", label: "Customer" },
]

const COLUMNS: DataTableColumn<PartnerRow>[] = [
  { header: "Kode", cell: (row) => <span className="font-mono text-foreground">{row.code}</span> },
  {
    header: "Nama",
    cell: (row) => <NameCell archived={!row.active}>{row.name}</NameCell>,
    className: "w-full whitespace-normal",
  },
  {
    header: "Peran",
    cell: (row) =>
      [row.isVendor && "Vendor", row.isCustomer && "Customer"].filter(Boolean).join(", "),
  },
  { header: "Negara", cell: (row) => row.countryCode },
  {
    header: "Identitas",
    cell: (row) => (
      <span>
        <span className="text-muted-foreground">{IDENTITY_TYPE_LABELS[row.identityType]} </span>
        <span className="font-mono">{row.identityNumber}</span>
      </span>
    ),
  },
  { header: "NITKU", cell: (row) => <span className="font-mono">{row.nitku ?? "—"}</span> },
]

export default function PartnersPage({ searchParams }: PageProps<"/master/partner">) {
  return (
    <>
      <PageHeader title="Partner" />
      <Suspense fallback={<DataTableSkeleton />}>
        <PartnerTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function PartnerTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const canEdit = hasPermission(user.roles, "master:write")
  const raw = await searchParams
  const params = parseListParams(raw)
  const role = pickFilter(raw, ROLE_FILTER, ["vendor", "customer"] as const)
  const { rows, total } = await listPartners({ ...params, role })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari kode, nama, NPWP, atau NITKU" />
        <DataTableFilter name={ROLE_FILTER} label="Peran" options={ROLE_OPTIONS} />
        {canEdit && (
          <Link href="/master/partner/baru" className={buttonVariants({ className: "sm:ml-auto" })}>
            <Plus />
            Tambah partner
          </Link>
        )}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/master/partner/${row.id}`}
        rowMuted={(row) => !row.active}
        empty={listEmptyState({
          searchParams: raw,
          basePath: "/master/partner",
          noun: "partner",
          create: canEdit ? { href: "/master/partner/baru", label: "Tambah partner" } : undefined,
        })}
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
