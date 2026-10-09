"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, navigationFor, type NavItem } from "@/lib/navigation"
import type { Role } from "@/lib/permissions"
import { cn } from "@/lib/utils"

// Menu sidebar sesuai peran user, dikelompokkan per area kerja: menu induk dengan ikon, menu anak
// menjorok tanpa ikon. Hanya tampilan; setiap halaman tetap mengecek izinnya sendiri di server.
export function AppSidebarNav({ roles }: { roles: Role[] }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  const link = (item: NavItem, className?: string, icon?: ReactNode) => {
    const active = isActivePath(pathname, item.href)
    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton
          render={
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              // Di HP menu berupa panel; tutup setelah memilih.
              onClick={() => isMobile && setOpenMobile(false)}
            />
          }
          isActive={active}
          // Modul yang belum dikerjakan diredupkan; tiketnya muncul saat kursor diarahkan.
          title={item.plannedIn ? `Belum tersedia, dijadwalkan di ${item.plannedIn}` : undefined}
          className={cn(
            "h-8 text-[0.9375rem] data-active:font-medium data-active:shadow-[inset_2px_0_0_var(--sidebar-primary)]",
            item.plannedIn && "text-muted-foreground",
            className,
          )}
        >
          {icon}
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return navigationFor(roles).map((group) => {
    const Icon = group.icon
    // Grup yang hanya berisi Beranda tampil sebagai satu menu setingkat menu induk.
    if (group.items.every((item) => item.href === "/")) {
      return (
        <SidebarGroup key={group.label} className="py-1">
          <SidebarMenu>
            {group.items.map((item) =>
              link(item, "font-semibold", <Icon className="text-muted-foreground" aria-hidden />),
            )}
          </SidebarMenu>
        </SidebarGroup>
      )
    }
    return (
      <SidebarGroup key={group.label} className="py-1">
        <SidebarGroupLabel className="h-8 gap-2 text-[0.9375rem] font-semibold text-sidebar-foreground">
          <Icon className="text-muted-foreground" aria-hidden />
          {group.label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          {/* Menu anak menjorok sejajar teks induknya (ikon 16px + jarak 8px). */}
          <SidebarMenu className="gap-0">
            {group.items.map((item) => link(item, "pl-8"))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  })
}
