"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { navigationTrail } from "@/lib/navigation"

// Konteks di header aplikasi: area kerja › modul. Modul menjadi tautan bila sedang berada di
// halaman turunannya (detail, tambah), supaya mudah kembali ke daftar.
export function AppBreadcrumb() {
  const pathname = usePathname()
  const trail = navigationTrail(pathname)
  if (!trail || trail.item.href === "/") {
    return <span className="text-sm font-medium">Beranda</span>
  }

  const onModulePage = pathname === trail.item.href
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{trail.group.label}</span>
      <span aria-hidden className="text-muted-foreground">
        /
      </span>
      {onModulePage ? (
        <span className="truncate font-medium" aria-current="page">
          {trail.item.title}
        </span>
      ) : (
        <Link
          href={trail.item.href}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          {trail.item.title}
        </Link>
      )}
    </nav>
  )
}
