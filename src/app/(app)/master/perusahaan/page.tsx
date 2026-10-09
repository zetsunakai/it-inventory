import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { FACILITY_TYPE_LABELS } from "@/lib/company"
import { formatDate } from "@/lib/format"
import { hasPermission } from "@/lib/permissions"
import { formatRefCode } from "@/lib/ref-codes"
import { requirePermission } from "@/server/auth/session"
import { getCompanyProfile } from "@/server/queries/company"

import { CompanyProfileForm } from "./company-profile-form"

export const metadata: Metadata = { title: "Profil perusahaan · IT Inventory" }

export default function CompanyProfilePage() {
  return (
    <>
      <PageHeader
        title="Profil perusahaan"
        description="Dipakai otomatis sebagai entitas Pengusaha/Pemilik di dokumen BC."
      />
      <Suspense fallback={<Skeleton className="h-96 w-full max-w-2xl" />}>
        <CompanyProfile />
      </Suspense>
    </>
  )
}

async function CompanyProfile() {
  const user = await requirePermission("master:read")
  const profile = await getCompanyProfile()

  if (hasPermission(user.roles, "master:write")) {
    return <CompanyProfileForm profile={profile} office={profile?.office ?? null} />
  }

  if (!profile) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Profil perusahaan belum diisi. Hubungi Administrator.
      </div>
    )
  }

  const rows: [string, string][] = [
    ["Nama perusahaan", profile.name],
    ["Alamat", profile.address],
    ["NPWP", profile.npwp],
    ["NITKU", profile.nitku],
    ["NIB", profile.nib],
    ["Jenis fasilitas", FACILITY_TYPE_LABELS[profile.facilityType]],
    [
      "Kantor pabean pengawas",
      profile.office ? formatRefCode(profile.office) : profile.supervisingOfficeCode,
    ],
    ["Nomor izin fasilitas", profile.permitNumber],
    ["Tanggal izin fasilitas", formatDate(new Date(`${profile.permitDate}T00:00:00+07:00`))],
  ]
  return (
    <dl className="grid max-w-2xl grid-cols-[12rem_1fr] gap-x-4 gap-y-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
