import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableFilter } from "@/components/data-table/data-table-filter"
import { DataTablePagination } from "@/components/data-table/data-table-pagination"
import { DataTableSearch } from "@/components/data-table/data-table-search"
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
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
  {
    header: "Kode",
    cell: (row) => (
      <Link
        href={`/master/partner/${row.id}`}
        className="font-mono underline-offset-4 hover:underline"
      >
        {row.code}
      </Link>
    ),
  },
  { header: "Nama", cell: (row) => row.name, className: "whitespace-normal" },
  {
    header: "Peran",
    cell: (row) => (
      <div className="flex gap-1">
        {row.isVendor && <Badge variant="secondary">Vendor</Badge>}
        {row.isCustomer && <Badge variant="secondary">Customer</Badge>}
      </div>
    ),
  },
  { header: "Negara", cell: (row) => <span className="font-mono">{row.countryCode}</span> },
  {
    header: "Identitas",
    cell: (row) => (
      <div>
        <p className="text-xs text-muted-foreground">{IDENTITY_TYPE_LABELS[row.identityType]}</p>
        <p className="font-mono">{row.identityNumber}</p>
      </div>
    ),
  },
  { header: "NITKU", cell: (row) => <span className="font-mono">{row.nitku ?? "—"}</span> },
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

export default function PartnersPage({ searchParams }: PageProps<"/master/partner">) {
  return (
    <>
      <PageHeader
        title="Partner"
        description="Vendor dan customer, dipakai sebagai entitas di dokumen BC."
      />
      <Suspense fallback={<DataTableSkeleton />}>
        <PartnerTable searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function PartnerTable({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requirePermission("master:read")
  const raw = await searchParams
  const params = parseListParams(raw)
  const role = pickFilter(raw, ROLE_FILTER, ["vendor", "customer"] as const)
  const { rows, total } = await listPartners({ ...params, role })

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <DataTableSearch placeholder="Cari kode, nama, NPWP, atau NITKU" />
        <DataTableFilter name={ROLE_FILTER} label="Peran" options={ROLE_OPTIONS} />
        {hasPermission(user.roles, "master:write") && (
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
        emptyMessage="Tidak ada partner yang cocok."
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
