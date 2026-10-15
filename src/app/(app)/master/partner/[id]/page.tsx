import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DeleteRecord } from "@/components/delete-record"
import { Skeleton } from "@/components/ui/skeleton"
import { IDENTITY_TYPE_LABELS } from "@/lib/partner"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getPartner } from "@/server/queries/partners"

import { deletePartner } from "../actions"
import { PartnerForm } from "../partner-form"
import { InfoGrid } from "@/components/layout/info-grid"
import { recordActivity } from "@/server/queries/activity"
import { masterNeighbors } from "@/server/queries/neighbors"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"

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
  const [neighbors, activity] = await Promise.all([
    masterNeighbors("partners", partner.code),
    recordActivity("partners", partner.id, PARTNER_ACTIVITY_LABELS),
  ])

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
    <DocumentLayout
      title={`${partner.code} · ${partner.name}`}
      meta={roles.join(" dan ")}
      crumbs={[{ label: partner.code }]}

      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="partner" />}
    >
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
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const PARTNER_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    address: "Alamat",
    country_code: "Negara",
    is_vendor: "Vendor",
    is_customer: "Customer",
    identity_type: "Jenis identitas",
    identity_number: "Nomor identitas",
    nitku: "NITKU",
    active: "Aktif",
  },
  values: { identity_type: IDENTITY_TYPE_LABELS as Record<string, string> },
}
