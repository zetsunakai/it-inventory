import Image from "next/image"
import type { ReactNode } from "react"

// Tata letak halaman masuk dan verifikasi (I-08): panel brand navy seperti sidebar di kiri (desktop),
// form di kanan tanpa kartu. Di layar kecil logo pindah ke atas form.
export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="grid flex-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-3">
          <Image
            src="/brand/veltics-logo.png"
            alt="Veltics"
            width={256}
            height={237}
            className="h-12 w-auto"
            preload
          />
          <span className="leading-tight">
            <span className="block text-control font-semibold text-sidebar-accent-foreground">
              IT Inventory
            </span>
            <span className="block text-caption">Kawasan Berikat</span>
          </span>
        </div>
        <p className="max-w-sm font-display text-page-title font-bold text-sidebar-accent-foreground">
          Stok, dokumen BC, dan laporan mutasi dalam satu catatan.
        </p>
      </section>
      <section className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-6">
          <Image
            src="/brand/veltics-logo.png"
            alt="Veltics"
            width={256}
            height={237}
            className="h-12 w-auto md:hidden"
            preload
          />
          <div className="space-y-1">
            <h1 className="font-display text-page-title font-bold">{title}</h1>
            <p className="text-control text-muted-foreground">{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  )
}
