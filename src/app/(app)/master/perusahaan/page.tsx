import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { FACILITY_TYPE_LABELS } from "@/modules/it-inventory/lib/company"
import { formatDate } from "@/lib/format"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getCompanyProfile } from "@/modules/it-inventory/server/queries/company"

import { CompanyProfileForm } from "./company-profile-form"
import { StaticField, ViewSection } from "@/components/form-field"
import { RecordModes } from "@/components/layout/record-modes"

export const metadata: Metadata = { title: "Profil perusahaan · IT Inventory" }

export default function CompanyProfilePage() {
  return (
    <>
      <PageHeader
        title="Profil perusahaan"
        description="Dipakai otomatis sebagai entitas Pengusaha/Pemilik di dokumen BC."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <CompanyProfile />
      </Suspense>
    </>
  )
}

async function CompanyProfile() {
  const user = await requirePermission("master:read")
  const profile = await getCompanyProfile()
  const canEdit = hasPermission(user.roles, "master:write")

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
            <StaticField label="Nama perusahaan" value={profile.name} span={12} />
            <StaticField label="Alamat" value={profile.address} span={12} />
            <StaticField label="NPWP" value={profile.npwp} mono span={4} />
            <StaticField label="NIB" value={profile.nib} mono span={4} />
            <StaticField label="NITKU" value={profile.nitku} mono span={4} />
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
