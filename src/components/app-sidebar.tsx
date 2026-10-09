import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { MFA_SETUP_PATH } from "@/lib/auth-config"
import { ROLE_LABELS } from "@/lib/permissions"
import { signOut } from "@/server/auth/actions"
import { requireUser } from "@/server/auth/session"

import { AppSidebarNav } from "./app-sidebar-nav"

// Kerangka sidebar statis (ikut di-prerender). Bagian yang bergantung pada user,
// yaitu menu per peran dan info akun, dimuat di balik <Suspense>.
export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-3 pt-4 pb-3">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {/* Logo di public/brand/logo.png (ganti filenya untuk mengganti logo). */}
          <Image
            src="/brand/logo.png"
            alt="Bea Cukai"
            width={256}
            height={201}
            preload
            className="h-10 w-auto shrink-0"
          />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[0.9375rem] font-semibold tracking-tight">
              IT Inventory
            </span>
            <span className="block truncate text-xs text-muted-foreground">Kawasan Berikat</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1">
        <Suspense fallback={<NavSkeleton />}>
          <RoleNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        <Suspense fallback={<Skeleton className="h-14 w-full" />}>
          <AccountMenu />
        </Suspense>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

async function RoleNav() {
  const user = await requireUser()
  return <AppSidebarNav roles={user.roles} />
}

async function AccountMenu() {
  const user = await requireUser()
  return (
    <div className="space-y-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.roles.map((role) => ROLE_LABELS[role]).join(", ") || "Belum punya peran"}
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <Link
          href={MFA_SETUP_PATH}
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Keamanan akun
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Keluar
          </button>
        </form>
      </div>
    </div>
  )
}

// Lebar tetap, bukan acak, supaya HTML server dan client sama.
const SKELETON_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"]

function NavSkeleton() {
  return (
    <div className="space-y-3 p-3" aria-busy="true" aria-label="Memuat menu">
      {SKELETON_WIDTHS.map((width) => (
        <Skeleton key={width} className={`h-4 ${width}`} />
      ))}
    </div>
  )
}
