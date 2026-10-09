"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, navigationFor } from "@/lib/navigation"
import type { Role } from "@/lib/permissions"

// Menu sidebar sesuai peran user. Hanya tampilan: setiap halaman tetap
// mengecek izinnya sendiri di server.
export function AppSidebarNav({ roles }: { roles: Role[] }) {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()

  return navigationFor(roles).map((group) => (
    <SidebarGroup key={group.label}>
      <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => {
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
                  tooltip={item.title}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ))
}
