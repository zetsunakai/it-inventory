import { LogOut, ShieldCheck, Warehouse } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Warehouse className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">IT Inventory</span>
                <span className="truncate text-xs text-muted-foreground">Kawasan Berikat</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<NavSkeleton />}>
          <RoleNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>
        <Suspense fallback={<Skeleton className="h-20 w-full" />}>
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
    <SidebarMenu>
      <SidebarMenuItem className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.roles.map((role) => ROLE_LABELS[role]).join(", ") || "Belum punya peran"}
        </p>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton render={<Link href={MFA_SETUP_PATH} />} tooltip="Keamanan akun">
          <ShieldCheck />
          <span>Keamanan akun</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <form action={signOut}>
          <SidebarMenuButton type="submit" tooltip="Keluar">
            <LogOut />
            <span>Keluar</span>
          </SidebarMenuButton>
        </form>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

// Lebar tetap, bukan acak, supaya HTML server dan client sama.
const SKELETON_WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5"]

function NavSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Memuat menu">
      {SKELETON_WIDTHS.map((width) => (
        <Skeleton key={width} className={`h-5 ${width}`} />
      ))}
    </div>
  )
}
