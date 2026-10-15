"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId, useState, type ReactNode } from "react"

import { usePageCrumbs } from "@/components/breadcrumb-context"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, navigationFor, type NavItem } from "@/lib/navigation"
import type { Role } from "@/lib/permissions"
import { cn } from "@/lib/utils"

// Menu sidebar sesuai peran user, dikelompokkan per area kerja: menu induk dengan ikon, menu anak
// menjorok tanpa ikon. Menu anak tersembunyi sampai menu induknya diklik; grup halaman yang sedang
// dibuka otomatis terbuka. Hanya tampilan; setiap halaman tetap mengecek izinnya sendiri di server.
export function AppSidebarNav({ roles }: { roles: Role[] }) {
  // Menu aktif mengikuti modul dokumen induk bila halaman punya (sama dengan breadcrumb), mis.
  // transfer keluar milik permintaan antar gudang menyalakan Transfer antar gudang.
  const currentPath = usePathname()
  const parentHref = usePageCrumbs()[0]?.href
  const pathname = parentHref ?? currentPath
  const { isMobile, setOpenMobile } = useSidebar()
  const groups = navigationFor(roles)
  const activeGroup = groups.find((group) =>
    group.items.some((item) => item.href !== "/" && isActivePath(pathname, item.href)),
  )?.label
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : {},
  )
  // Pindah ke halaman di grup lain: grup itu ikut terbuka, grup yang dibuka user tetap terbuka.
  const [shownActive, setShownActive] = useState(activeGroup)
  if (activeGroup !== shownActive) {
    setShownActive(activeGroup)
    if (activeGroup && !open[activeGroup]) setOpen({ ...open, [activeGroup]: true })
  }
  const baseId = useId()

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
            "h-9 text-control data-active:font-medium data-active:shadow-[inset_2px_0_0_var(--sidebar-primary)]",
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

  return groups.map((group, index) => {
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
    const expanded = Boolean(open[group.label])
    const contentId = `${baseId}-group-${index}`
    return (
      <SidebarGroup key={group.label} className="py-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setOpen({ ...open, [group.label]: !expanded })}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-control font-semibold text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0"
        >
          <Icon className="text-muted-foreground" aria-hidden />
          <span className="flex-1 truncate">{group.label}</span>
          <ChevronRight
            className={cn(
              "text-muted-foreground transition-transform duration-150",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        </button>
        <SidebarGroupContent id={contentId} hidden={!expanded}>
          {/* Menu anak menjorok sejajar teks induknya (ikon 16px + jarak 8px). */}
          <SidebarMenu className="gap-0">
            {group.items.map((item) => link(item, "pl-8"))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  })
}
