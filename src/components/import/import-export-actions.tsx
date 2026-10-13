import { Upload } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { buttonVariants } from "@/components/ui/button"
import { hasPermission } from "@/lib/permissions"
import { getCurrentUser } from "@/server/auth/session"

import { ExportMenu } from "./export-menu"

// Aksi Export dan Import di header halaman daftar master data (M1-07). Export untuk semua yang
// boleh melihat halaman; Import hanya untuk peran dengan master:write. Tombol Import membaca sesi,
// jadi dibungkus Suspense supaya header tetap ikut di-prerender.
export function ImportExportActions({
  exportHref,
  importHref,
  noun,
}: {
  exportHref: string
  importHref: string
  // Ditulis di tombol bila halaman berisi lebih dari satu jenis data, mis. "lokasi".
  noun?: string
}) {
  return (
    <>
      <ExportMenu href={exportHref} label={noun ? `Export ${noun}` : "Export"} />
      <Suspense fallback={null}>
        <ImportLink href={importHref} label={noun ? `Import ${noun}` : "Import"} />
      </Suspense>
    </>
  )
}

async function ImportLink({ href, label }: { href: string; label: string }) {
  const user = await getCurrentUser()
  if (!user || !hasPermission(user.roles, "master:write")) return null
  return (
    <Link href={href} className={buttonVariants({ variant: "outline" })}>
      <Upload />
      {label}
    </Link>
  )
}
