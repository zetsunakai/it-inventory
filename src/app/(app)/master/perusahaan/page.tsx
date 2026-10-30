import type { Metadata } from "next"
import { Suspense } from "react"

import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { FACILITY_TYPE_LABELS } from "@/modules/it-inventory/lib/company"
import { formatDate } from "@/lib/format"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { recordActivity } from "@/server/queries/activity"
import { getCompanyProfile } from "@/modules/it-inventory/server/queries/company"

import { CompanyProfileForm } from "./company-profile-form"
import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"

export const metadata: Metadata = { title: "Profil perusahaan · IT Inventory" }

export default function CompanyProfilePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CompanyProfilePanel />
    </Suspense>
  )
}

// Satu template dengan halaman detail lain: isi profil dan panel Aktivitas dari audit log
// (profil satu baris, record_id-nya "true").
async function CompanyProfilePanel() {
  const user = await requirePermission("master:read")
  const activity = await recordActivity("company", "true", COMPANY_ACTIVITY_LABELS)
  return (
    <DocumentLayout
      title="Profil perusahaan"
      meta="Dipakai otomatis sebagai entitas Pengusaha/Pemilik di dokumen BC."
      activity={<ActivityLog entries={activity} noun="profil perusahaan" />}
    >
      <CompanyProfile canEdit={hasPermission(user.roles, "master:write")} />
    </DocumentLayout>
  )
}

async function CompanyProfile({ canEdit }: { canEdit: boolean }) {
  const profile = await getCompanyProfile()

  // Belum diisi: langsung form bagi yang berhak mengubah.
  if (!profile) {
    if (canEdit) {
      return (
        <RecordModes
          canEdit
          initialEditing
          view={null}
          form={<CompanyProfileForm profile={null} office={null} />}
        />
      )
    }
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Profil perusahaan belum diisi. Hubungi Administrator.
      </div>
    )
  }

  return (
    <RecordModes
      canEdit={canEdit}
      view={
        <>
          <ViewSection title="Identitas perusahaan">
            <StaticField label="Nama perusahaan" value={profile.name} span={6} />
            <StaticField multiline label="Alamat" value={profile.address} span={6} />
            <StaticField label="NPWP" value={profile.npwp} mono span={6} />
            <StaticField label="NIB" value={profile.nib} mono span={6} />
            <StaticField label="NITKU" value={profile.nitku} mono span={6} />
          </ViewSection>
          <ViewSection title="Fasilitas kawasan berikat">
            <StaticField
              label="Jenis fasilitas"
              value={FACILITY_TYPE_LABELS[profile.facilityType]}
            />
            <StaticField
              label="Kantor pabean pengawas"
              value={profile.office ? formatRefCode(profile.office) : profile.supervisingOfficeCode}
            />
            <StaticField label="Nomor izin fasilitas" value={profile.permitNumber} />
            <StaticField
              label="Tanggal izin fasilitas"
              value={formatDate(new Date(`${profile.permitDate}T00:00:00+07:00`))}
            />
          </ViewSection>
        </>
      }
      form={canEdit && <CompanyProfileForm profile={profile} office={profile.office ?? null} />}
    />
  )
}

const COMPANY_ACTIVITY_LABELS = {
  fields: {
    name: "Nama perusahaan",
    address: "Alamat",
    npwp: "NPWP",
    nitku: "NITKU",
    nib: "NIB",
    facility_type: "Jenis fasilitas",
    permit_number: "Nomor izin fasilitas",
    permit_date: "Tanggal izin fasilitas",
    supervising_office_code: "Kantor pabean pengawas",
  },
  values: { facility_type: FACILITY_TYPE_LABELS as Record<string, string> },
}
