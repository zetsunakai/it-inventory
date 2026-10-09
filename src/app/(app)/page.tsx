import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/server/auth/session"

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Beranda"
        description="Pencatatan pergerakan barang di gudang berikat yang terhubung dengan dokumen BC."
      />
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Welcome />
      </Suspense>
    </>
  )
}

async function Welcome() {
  const user = await requireUser()
  return (
    <div className="rounded-lg border p-6">
      <p className="font-medium">Selamat datang, {user.name}.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Dashboard pengecualian (PRD bagian 8.6) akan tampil di sini mulai M4. Pilih modul dari menu
        di samping.
      </p>
    </div>
  )
}
