"use client"

import { ArrowLeftRight, ChevronRight, Search, X } from "lucide-react"
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import {
  isActivePath,
  MODULE_MENUS,
  moduleForPath,
  modulesFor,
  navEntries,
  navigationFor,
  type NavGroup,
  type NavItem,
} from "@/lib/navigation"
import type { AppModule, Role } from "@/lib/permissions"
import { cn } from "@/lib/utils"

// Menu sidebar mengikuti hmx-002 (backlog RU-21): kotak cari menu, bagian (menu induk berikon)
// yang dibuka-tutup dengan garis pemisah, item aktif berlatar biru. Saat sidebar diciutkan, bagian
// tampil sebagai ikon dengan tooltip; klik membuka panel melayang berisi menunya. Hanya tampilan;
// setiap halaman tetap mengecek izinnya sendiri di server.
//
// Menu per modul (S-02, seperti active-section webx hmx): pemilih modul di atas sidebar; sidebar
// hanya menampilkan area kerja modul aktif. Modul aktif mengikuti halaman yang dibuka; pencarian
// menu tetap mencari ke semua modul.

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
  const allGroups = navigationFor(roles)
  const modules = modulesFor(allGroups)
  const pathModule = moduleForPath(pathname)
  const [module, setModule] = useState<AppModule | undefined>(pathModule ?? modules[0])
  // Pindah ke halaman milik modul lain (mis. tautan langsung): menu ikut berpindah.
  const [shownPathModule, setShownPathModule] = useState(pathModule)
  if (pathModule !== shownPathModule) {
    setShownPathModule(pathModule)
    if (pathModule) setModule(pathModule)
  }
  const groups = allGroups.filter((group) => group.module === module)
  const activeGroup = groups.find((group) =>
    group.items.some((item) => item.href !== "/" && isActivePath(pathname, item.href)),
  )?.label
  // Semua bagian terbuka secara bawaan seperti hmx (expandTopSections di sidebar.js); yang dicatat
  // hanya bagian yang ditutup user.
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  // Pindah ke halaman di bagian yang sedang ditutup: bagian itu dibuka lagi.
  const [shownActive, setShownActive] = useState(activeGroup)
  if (activeGroup !== shownActive) {
    setShownActive(activeGroup)
    if (activeGroup && closed[activeGroup]) setClosed({ ...closed, [activeGroup]: false })
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

  const switcher = modules.length > 1 && (
    <ModuleSwitcher modules={modules} value={module} onChange={setModule} collapsed={collapsed} />
  )

  // Hasil cari: daftar menu yang cocok beserta nama bagiannya, dari semua modul.
  if (term) {
    const matches = allGroups.flatMap((group) =>
      group.items
        .filter(
          (item) =>
            item.title.toLowerCase().includes(term) ||
            group.label.toLowerCase().includes(term) ||
            Boolean(item.submenu?.toLowerCase().includes(term)),
        )
        .map((item) => ({ group, item })),
    )
    return (
      <>
        {switcher}
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
                      <span className="truncate text-caption opacity-75">
                        {MODULE_MENUS[group.module].label} · {group.label}
                        {item.submenu && <> · {item.submenu}</>}
                      </span>
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
      {switcher}
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
        const expanded = !closed[group.label]
        const hasActive = group.label === activeGroup
        const contentId = `${baseId}-group-${index}`
        return (
          <SidebarGroup key={group.label} className="border-t border-sidebar-border py-1.5">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              data-nav-group
              onClick={() => setClosed({ ...closed, [group.label]: expanded })}
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
                {navEntries(group.items).map((entry) =>
                  entry.kind === "item" ? (
                    link(entry.item, "pl-[42px]")
                  ) : (
                    <SubmenuEntry
                      key={entry.title}
                      title={entry.title}
                      items={entry.items}
                      pathname={pathname}
                      onNavigate={close}
                    />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}
    </>
  )
}

function CollapsedLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href)
  return (
    <DropdownMenuItem
      render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
      className={cn("h-9", active && "font-medium text-primary")}
    >
      {item.title}
    </DropdownMenuItem>
  )
}

// Sub menu entry seperti hmx (menu-entry.vue): klik entry membuka daftar menunya di panel yang
// melayang di samping sidebar; klik di luar atau memilih menu menutupnya. Entry ikut menyala bila
// salah satu menunya sedang dibuka.
function SubmenuEntry({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string
  items: NavItem[]
  pathname: string
  onNavigate: () => void
}) {
  const active = items.some((item) => isActivePath(pathname, item.href))
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuButton isActive={active} className={cn(ITEM, "pl-[42px]")} />}
        >
          <span className="flex-1 truncate">{title}</span>
          <ChevronRight className="size-4 shrink-0 opacity-70" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={16}
          className="max-h-[calc(100vh-100px)] w-72 p-1.5"
        >
          {items.map((item) => {
            const current = isActivePath(pathname, item.href)
            return (
              <DropdownMenuItem
                key={item.href}
                render={
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    onClick={onNavigate}
                  />
                }
                className={cn(
                  "h-10 px-2 font-medium",
                  current &&
                    "bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                )}
              >
                {item.title}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
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
                {navEntries(group.items).map((entry) =>
                  entry.kind === "item" ? (
                    <CollapsedLink key={entry.item.href} item={entry.item} pathname={pathname} />
                  ) : (
                    // Sub menu di panel melayang: daftar menunya membuka satu tingkat lagi ke samping.
                    <DropdownMenuSub key={entry.title}>
                      <DropdownMenuSubTrigger
                        className={cn(
                          "h-9",
                          entry.items.some((item) => isActivePath(pathname, item.href)) &&
                            "font-medium text-primary",
                        )}
                      >
                        {entry.title}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-72">
                        {entry.items.map((item) => (
                          <CollapsedLink key={item.href} item={item} pathname={pathname} />
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ),
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

// Pemilih modul (S-02): nama dan ikon modul aktif dengan ikon tukar; pilihannya hanya modul yang
// punya menu untuk peran user. Memilih modul hanya mengganti menu, bukan membuka halaman.
function ModuleSwitcher({
  modules,
  value,
  onChange,
  collapsed,
}: {
  modules: AppModule[]
  value: AppModule | undefined
  onChange: (module: AppModule) => void
  collapsed: boolean
}) {
  const current = value ? MODULE_MENUS[value] : undefined
  const Icon = current?.icon
  return (
    <SidebarGroup className={cn("pb-2", collapsed ? "pt-0" : "px-2 pt-0")}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  tooltip={collapsed ? `Modul: ${current?.label ?? "-"}` : undefined}
                  aria-label={`Ganti modul, sekarang ${current?.label ?? "belum dipilih"}`}
                  className={cn(
                    "h-11 rounded-lg border border-sidebar-border bg-background px-3 text-control font-semibold text-sidebar-foreground hover:bg-sidebar-accent",
                    // Sidebar ciut: ikon modul saja, seukuran ikon menu lain.
                    collapsed && "justify-center px-0",
                  )}
                />
              }
            >
              {Icon && <Icon className="size-[18px] shrink-0 text-primary" aria-hidden />}
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">{current?.label}</span>
                  <ArrowLeftRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={collapsed ? "right" : "bottom"}
              align="start"
              sideOffset={6}
              className="w-56"
            >
              <DropdownMenuGroup>
                <DropdownMenuRadioGroup
                  value={value}
                  onValueChange={(next) => onChange(next as AppModule)}
                >
                  {modules.map((module) => {
                    const ModuleIcon = MODULE_MENUS[module].icon
                    return (
                      <DropdownMenuRadioItem
                        key={module}
                        value={module}
                        closeOnClick
                        className="h-10"
                      >
                        <ModuleIcon className="size-4 text-muted-foreground" aria-hidden />
                        {MODULE_MENUS[module].label}
                      </DropdownMenuRadioItem>
                    )
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
