import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IDENTITY_TYPE_LABELS } from "@/lib/partner"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getPartner } from "@/server/queries/partners"

import { deletePartner } from "../actions"
import { PartnerForm } from "../partner-form"
import { InfoGrid } from "@/components/layout/info-grid"

export const metadata: Metadata = { title: "Detail partner · IT Inventory" }

export default function PartnerPage({ params }: PageProps<"/master/partner/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-4xl" />}>
      <PartnerDetail params={params} />
    </Suspense>
  )
}

async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("master:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const partner = await getPartner(id)
  if (!partner) notFound()

  const roles = [partner.isVendor && "Vendor", partner.isCustomer && "Customer"].filter(Boolean)
  const rows: [string, string][] = [
    ["Alamat", partner.address],
    ["Negara", partner.country ? formatRefCode(partner.country) : partner.countryCode],
    ["Peran", roles.join(", ")],
    ["Jenis identitas", IDENTITY_TYPE_LABELS[partner.identityType]],
    ["Nomor identitas", partner.identityNumber],
    ["NITKU", partner.nitku ?? "—"],
    ["Status", partner.active ? "Aktif" : "Diarsipkan"],
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${partner.code} · ${partner.name}`}
        description={roles.join(" dan ")}
        crumbs={[{ label: partner.code }]}
      />
      {hasPermission(user.roles, "master:write") ? (
        <>
          <PartnerForm partner={partner} />
          <DeleteRecord
            action={deletePartner}
            id={partner.id}
            noun="partner"
            label={partner.code}
            listHref="/master/partner"
          />
        </>
      ) : (
        <InfoGrid
          items={rows.map(([label, value]) => ({
            label,
            value,
            wide: label === "Alamat" || label === "Deskripsi" || label === "Catatan",
          }))}
        />
      )}
    </div>
  )
}
