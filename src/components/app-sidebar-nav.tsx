"use client"

import { ChevronRight, Search, X } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId, useState, type ReactNode } from "react"

import { usePageCrumbs } from "@/components/breadcrumb-context"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, navigationFor, type NavGroup, type NavItem } from "@/lib/navigation"
import type { Role } from "@/lib/permissions"
import { cn } from "@/lib/utils"

// Menu sidebar mengikuti hmx-002 (backlog RU-21): kotak cari menu, bagian (menu induk berikon)
// yang dibuka-tutup dengan garis pemisah, item aktif berlatar biru. Saat sidebar diciutkan, bagian
// tampil sebagai ikon dengan tooltip; klik membuka panel melayang berisi menunya. Hanya tampilan;
// setiap halaman tetap mengecek izinnya sendiri di server.

const ITEM =
  "h-10 rounded-md px-3 text-control text-sidebar-foreground hover:bg-sidebar-accent data-active:bg-linear-to-r data-active:from-primary data-active:from-40% data-active:to-primary-dark data-active:font-medium data-active:text-primary-foreground data-active:hover:text-primary-foreground"

export function AppSidebarNav({ roles }: { roles: Role[] }) {
  // Menu aktif mengikuti modul dokumen induk bila halaman punya (sama dengan breadcrumb), mis.
  // transfer keluar milik permintaan antar gudang menyalakan Transfer antar gudang.
  const currentPath = usePathname()
  const parentHref = usePageCrumbs()[0]?.href
  const pathname = parentHref ?? currentPath
  const { isMobile, setOpenMobile, state } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const [query, setQuery] = useState("")
  const groups = navigationFor(roles)
  const activeGroup = groups.find((group) =>
    group.items.some((item) => item.href !== "/" && isActivePath(pathname, item.href)),
  )?.label
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : {},
  )
  // Pindah ke halaman di bagian lain: bagian itu ikut terbuka, yang dibuka user tetap terbuka.
  const [shownActive, setShownActive] = useState(activeGroup)
  if (activeGroup !== shownActive) {
    setShownActive(activeGroup)
    if (activeGroup && !open[activeGroup]) setOpen({ ...open, [activeGroup]: true })
  }
  const baseId = useId()
  const close = () => isMobile && setOpenMobile(false)

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
              onClick={close}
            />
          }
          isActive={active}
          tooltip={collapsed ? item.title : undefined}
          // Modul yang belum dikerjakan diredupkan; tiketnya muncul saat kursor diarahkan.
          title={item.plannedIn ? `Belum tersedia, dijadwalkan di ${item.plannedIn}` : undefined}
          className={cn(ITEM, item.plannedIn && "text-muted-foreground", className)}
        >
          {icon}
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  const term = query.trim().toLowerCase()
  const search = !collapsed && (
    <div className="relative px-2 pt-1 pb-2">
      <Search
        className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setQuery("")}
        placeholder="Cari menu"
        aria-label="Cari menu"
        className="h-10 w-full rounded-lg border border-sidebar-border bg-background pr-8 pl-9 text-control outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Hapus pencarian menu"
          className="absolute top-1/2 right-4 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )

  // Hasil cari: daftar menu yang cocok beserta nama bagiannya.
  if (term) {
    const matches = groups.flatMap((group) =>
      group.items
        .filter(
          (item) =>
            item.title.toLowerCase().includes(term) || group.label.toLowerCase().includes(term),
        )
        .map((item) => ({ group, item })),
    )
    return (
      <>
        {search}
        <SidebarGroup className="py-0">
          {matches.length ? (
            <SidebarMenu className="gap-0.5">
              {matches.map(({ group, item }) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} onClick={close} />}
                    isActive={isActivePath(pathname, item.href)}
                    className={cn(ITEM, "h-auto py-2")}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{item.title}</span>
                      <span className="truncate text-caption opacity-75">{group.label}</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          ) : (
            <p className="px-3 py-2 text-control text-muted-foreground">
              Tidak ada menu yang cocok.
            </p>
          )}
        </SidebarGroup>
      </>
    )
  }

  return (
    <>
      {search}
      {groups.map((group, index) => {
        const Icon = group.icon
        // Beranda tampil sebagai satu menu setingkat menu induk.
        if (group.items.every((item) => item.href === "/")) {
          return (
            <SidebarGroup key={group.label} className="py-0.5">
              <SidebarMenu>
                {group.items.map((item) =>
                  link(item, "font-medium", <Icon className="size-[18px]" aria-hidden />),
                )}
              </SidebarMenu>
            </SidebarGroup>
          )
        }
        if (collapsed) {
          return <CollapsedGroup key={group.label} group={group} pathname={pathname} />
        }
        const expanded = Boolean(open[group.label])
        const hasActive = group.label === activeGroup
        const contentId = `${baseId}-group-${index}`
        return (
          <SidebarGroup key={group.label} className="border-t border-sidebar-border py-1.5">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setOpen({ ...open, [group.label]: !expanded })}
              className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-control font-medium text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent focus-visible:ring-2"
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0",
                  hasActive ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden
              />
              <span className="flex-1 truncate">{group.label}</span>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  expanded && "rotate-90",
                )}
                aria-hidden
              />
            </button>
            <SidebarGroupContent id={contentId} hidden={!expanded} className="pt-0.5">
              {/* Menu anak sejajar teks menu induknya (ikon 18px + jarak 12px). */}
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => link(item, "pl-[42px]"))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}

// Sidebar ciut: ikon bagian dengan tooltip; klik membuka panel melayang berisi menunya.
function CollapsedGroup({ group, pathname }: { group: NavGroup; pathname: string }) {
  const Icon = group.icon
  const hasActive = group.items.some((item) => isActivePath(pathname, item.href))
  return (
    <SidebarGroup className="py-0.5">
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  tooltip={group.label}
                  isActive={hasActive}
                  aria-label={group.label}
                  className={ITEM}
                />
              }
            >
              <Icon className="size-[18px]" aria-hidden />
              <span>{group.label}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-caption">{group.label}</DropdownMenuLabel>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href)
                  return (
                    <DropdownMenuItem
                      key={item.href}
                      render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                      className={cn("h-9", active && "font-medium text-primary")}
                    >
                      {item.title}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
