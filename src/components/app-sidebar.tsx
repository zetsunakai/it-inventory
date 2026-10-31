import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { Sidebar, SidebarContent, SidebarHeader, SidebarRail } from "@/components/ui/sidebar"
import { MFA_SETUP_PATH } from "@/lib/auth-config"
import { ROLE_LABELS } from "@/lib/permissions"
import { requireUser } from "@/server/auth/session"

import { AppSidebarNav } from "./app-sidebar-nav"
import { AppUserMenu } from "./app-user-menu"

// Kerangka sidebar statis (ikut di-prerender), mengikuti hmx-002 (RU-21): bisa diciutkan jadi
// ikon. Menu per peran dimuat di balik <Suspense>; menu akun ada di bar atas.
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3 group-data-[collapsible=icon]:px-1.5">
        {/* Sidebar disembunyikan (mode ikon): logo tidak ikut tampil, bukan diciutkan jadi gepeng. */}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md p-1 outline-none group-data-[collapsible=icon]:hidden focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {/* Logo di public/brand/veltinc-logo.png (ganti filenya untuk mengganti logo). */}
          <Image
            src="/brand/veltinc-logo.png"
            alt="Veltinc"
            width={256}
            height={210}
            preload
            className="h-10 w-auto shrink-0"
          />
          <span className="min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="block truncate text-control font-semibold tracking-tight text-sidebar-accent-foreground">
              IT Inventory
            </span>
            <span className="block truncate text-caption text-sidebar-foreground">
              Kawasan Berikat
            </span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1 pt-3">
        <Suspense fallback={<NavSkeleton />}>
          <RoleNav />
        </Suspense>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

async function RoleNav() {
  const user = await requireUser()
  return <AppSidebarNav roles={user.roles} />
}

// Menu user di bar atas (RU-21); sesi dibaca di balik <Suspense> di layout.
export async function AccountMenu() {
  const user = await requireUser()
  return (
    <AppUserMenu
      name={user.name}
      roles={user.roles.map((role) => ROLE_LABELS[role]).join(", ") || "Belum punya peran"}
      securityHref={MFA_SETUP_PATH}
    />
  )
}

// Lebar tetap, bukan acak, supaya HTML server dan client sama.
const SKELETON_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"]

function NavSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-busy="true" aria-label="Memuat menu">
      {SKELETON_WIDTHS.map((width) => (
        <Skeleton key={width} className={`h-4 bg-sidebar-accent ${width}`} />
      ))}
    </div>
  )
}
