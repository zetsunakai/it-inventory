"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

// Tingkat breadcrumb di bawah modul (backlog UF-02), diisi halaman yang sedang tampil: dokumen
// induk dan halaman ini sendiri, mis. Retur › PRT/2026/00004 › RTR/2026/00007. Header ada di layout
// dan tidak tahu data halaman, jadi halaman mendaftarkannya lewat <PageCrumbs> (dipanggil
// PageHeader). Tingkat terakhir tanpa href.

export type Crumb = { label: string; href?: string }

const BreadcrumbContext = createContext<{
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
} | null>(null)

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  return <BreadcrumbContext value={{ crumbs, setCrumbs }}>{children}</BreadcrumbContext>
}

export function usePageCrumbs(): Crumb[] {
  return useContext(BreadcrumbContext)?.crumbs ?? []
}

// Didaftarkan saat halaman tampil dan dihapus saat halaman ditinggalkan (tanpa usePathname, supaya
// PageHeader di bagian statis halaman tetap bisa di-prerender).
export function PageCrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const setCrumbs = useContext(BreadcrumbContext)?.setCrumbs
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    if (!setCrumbs) return
    setCrumbs(JSON.parse(key) as Crumb[])
    return () => setCrumbs([])
  }, [setCrumbs, key])
  return null
}
