import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"
import { Skeleton } from "@/components/ui/skeleton"
import { IDENTITY_TYPE_LABELS } from "@/modules/inventory/lib/partner"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getPartner } from "@/modules/inventory/server/queries/partners"

import { PartnerForm } from "../partner-form"
import { recordActivity } from "@/server/queries/activity"
import { masterNeighbors } from "@/server/queries/neighbors"
import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"

export const metadata: Metadata = { title: "Detail partner · IT Inventory" }

export default function PartnerPage({ params }: PageProps<"/master/partner/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
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

  const canEdit = hasPermission(user.roles, "master:write")
  const view = (
    <>
      <ViewSection title="Data partner">
        <StaticField label="Nama partner" value={partner.name} span={12} />
        <StaticField label="Alamat" value={partner.address} span={8} />
        <StaticField
          label="Negara"
          value={partner.country ? formatRefCode(partner.country) : partner.countryCode}
          span={4}
        />
        <StaticField label="Status" value={partner.active ? "Aktif" : "Diarsipkan"} />
      </ViewSection>
      <ViewSection title="Identitas">
        <StaticField
          label="Jenis identitas"
          value={IDENTITY_TYPE_LABELS[partner.identityType]}
          span={4}
        />
        <StaticField label="NPWP" value={partner.identityNumber} mono span={8} />
        <StaticField label="NITKU" value={partner.nitku ?? "—"} mono />
      </ViewSection>
    </>
  )

  return (
    <DocumentLayout
      title={partner.name}
      meta={`${IDENTITY_TYPE_LABELS[partner.identityType]} ${partner.identityNumber}`}
      crumbs={[{ label: partner.name }]}
      neighbors={neighbors}
      activity={<ActivityLog entries={activity} noun="partner" />}
    >
      <RecordModes
        key={partner.id}
        canEdit={canEdit}
        createHref="/master/partner/baru"
        view={view}
        form={canEdit && <PartnerForm partner={partner} />}
      />
    </DocumentLayout>
  )
}

// Label log aktivitas (RU-23).
const PARTNER_ACTIVITY_LABELS = {
  fields: {
    name: "Nama",
    address: "Alamat",
    country_code: "Negara",
    identity_type: "Jenis identitas",
    identity_number: "NPWP",
    nitku: "NITKU",
    active: "Aktif",
  },
  values: { identity_type: IDENTITY_TYPE_LABELS as Record<string, string> },
}
