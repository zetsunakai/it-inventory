import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IDENTITY_TYPE_LABELS } from "@/lib/partner"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getPartner } from "@/server/queries/partners"

import { PartnerForm } from "../partner-form"

export const metadata: Metadata = { title: "Detail partner · IT Inventory" }

export default function PartnerPage({ params }: PageProps<"/master/partner/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-3xl" />}>
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
      <PageHeader title={`${partner.code} · ${partner.name}`} description={roles.join(" dan ")} />
      {hasPermission(user.roles, "master:write") ? (
        <PartnerForm partner={partner} />
      ) : (
        <dl className="grid max-w-3xl grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
