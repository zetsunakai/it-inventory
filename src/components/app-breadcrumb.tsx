"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Fragment } from "react"

import { navigationTrail } from "@/lib/navigation"

import { usePageCrumbs, type Crumb } from "./breadcrumb-context"

const LINK = "truncate underline-offset-4 hover:text-foreground hover:underline"

// Breadcrumb header (backlog UF-02): Area › Modul › tingkat halaman (dokumen induk, nomor dokumen,
// Tambah, Import) yang didaftarkan halaman lewat PageHeader. Semua tingkat kecuali yang terakhir
// bisa diklik; area tidak punya halaman sendiri. Di HP: tombol kembali ke tingkat sebelumnya dan
// nama halaman ini saja.
export function AppBreadcrumb() {
  const pathname = usePathname()
  const pageCrumbs = usePageCrumbs()
  // Dokumen induk menentukan modulnya (mis. transfer keluar milik permintaan antar gudang ada di
  // /inventory/transfer, tapi modulnya Transfer antar gudang).
  const parentHref = pageCrumbs[0]?.href
  const trail = (parentHref && navigationTrail(parentHref)) || navigationTrail(pathname)
  if (!trail || trail.item.href === "/") {
    return <span className="text-control font-medium">Beranda</span>
  }

  const onModulePage = pathname === trail.item.href
  const crumbs: Crumb[] = [
    { label: trail.item.title, href: onModulePage ? undefined : trail.item.href },
    ...(onModulePage ? [] : pageCrumbs),
  ]
  const current = crumbs.at(-1)!
  const parent = crumbs.slice(0, -1).findLast((crumb) => crumb.href)

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center text-control">
      {/* HP: kembali ke tingkat sebelumnya. */}
      <div className="flex min-w-0 items-center gap-1 sm:hidden">
        {parent?.href && (
          <Link
            href={parent.href}
            aria-label={`Kembali ke ${parent.label}`}
            className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
        )}
        <span className="truncate font-medium" aria-current="page">
          {current.label}
        </span>
      </div>
      <ol className="hidden min-w-0 items-center gap-1.5 sm:flex">
        <li className="shrink-0 text-muted-foreground">{trail.group.label}</li>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <Fragment key={`${index}-${crumb.label}`}>
              <li aria-hidden className="shrink-0 text-muted-foreground">
                <ChevronRight className="size-4" />
              </li>
              <li
                className={last ? "min-w-0 truncate font-medium" : "min-w-0 text-muted-foreground"}
              >
                {last || !crumb.href ? (
                  <span aria-current={last ? "page" : undefined} className="truncate">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className={LINK}>
                    {crumb.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
