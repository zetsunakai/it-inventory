import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  FileCheck2,
  ChartColumn,
  Database,
  House,
  Landmark,
  Library,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"

import {
  APP_MODULES,
  type AppModule,
  hasPermission,
  type Permission,
  type Role,
} from "./permissions"
import { refCodeListHref, refCodeMenuTitle, type RefCodeType } from "./ref-codes"

// Satu sumber untuk menu sidebar dan halaman modul. Menu hanya menyembunyikan
// yang tidak boleh dibuka; pengecekan izin yang menentukan tetap di setiap halaman.

export type NavItem = {
  title: string
  href: string
  // Tanpa permission = boleh dibuka semua user yang login.
  permission?: Permission
  // Tiket backlog yang mengisi modul ini, ditampilkan selama modul masih kosong.
  plannedIn?: string
  // Sub menu entry di dalam grup, seperti hmx: grup › sub menu › daftar menu yang terbuka melayang
  // di samping sidebar. Item berurutan dengan submenu yang sama menjadi satu entry.
  submenu?: string
}

export type NavGroup = {
  label: string
  // Modul pemilik area kerja ini (S-01).
  module: AppModule
  // Ikon area kerja, hanya di tingkat grup (menu anak tanpa ikon). Grup Umum memakai ikon
  // untuk Beranda.
  icon: LucideIcon
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: "Umum",
    // Beranda berisi pekerjaan inventory yang perlu perhatian (RU-01).
    module: "inventory",
    icon: House,
    items: [{ title: "Beranda", href: "/" }],
  },
  // Inventory dipecah seperti Odoo (RU-01): dokumen yang memindahkan barang, lalu melihat dan
  // mengoreksi stok.
  {
    label: "Operasi gudang",
    module: "inventory",
    icon: ArrowLeftRight,
    items: [
      { title: "Penerimaan", href: "/inventory/penerimaan", permission: "inventory:read" },
      { title: "Pengiriman", href: "/inventory/pengiriman", permission: "inventory:read" },
      { title: "Pindah lokasi", href: "/inventory/transfer", permission: "inventory:read" },
      {
        title: "Transfer antar gudang",
        href: "/inventory/antar-gudang",
        permission: "inventory:read",
      },
      { title: "Retur", href: "/inventory/retur", permission: "inventory:read" },
      { title: "Pemakaian & scrap", href: "/inventory/scrap", permission: "inventory:read" },
    ],
  },
  {
    label: "Stok & kontrol",
    module: "inventory",
    icon: Boxes,
    items: [
      { title: "Stok", href: "/inventory/stok", permission: "inventory:read" },
      { title: "Lot & nomor seri", href: "/inventory/lot", permission: "inventory:read" },
      { title: "Stock opname", href: "/inventory/opname", permission: "inventory:read" },
      { title: "Penyesuaian", href: "/inventory/penyesuaian", permission: "inventory:read" },
      { title: "Tutup periode", href: "/inventory/periode", permission: "inventory:approve" },
    ],
  },
  // Dokumen BC dikelompokkan seperti menu hmx (Dokumen Impor, Ekspor, TPB), satu menu per jenis
  // (keputusan 17/10/2026). Semua jenis sudah punya form (backlog D-01–D-08).
  {
    label: "Dokumen impor",
    module: "it-inventory",
    icon: ArrowDownToLine,
    items: [{ title: "BC 2.0", href: "/dokumen-bc/bc20", permission: "bc:read" }],
  },
  {
    label: "Dokumen ekspor",
    module: "it-inventory",
    icon: ArrowUpFromLine,
    items: [
      { title: "BC 3.0", href: "/dokumen-bc/bc30", permission: "bc:read" },
      { title: "BC 3.3", href: "/dokumen-bc/bc33", permission: "bc:read" },
      { title: "P3BET", href: "/dokumen-bc/p3bet", permission: "bc:read" },
    ],
  },
  {
    label: "Dokumen TPB",
    module: "it-inventory",
    icon: Landmark,
    items: [
      { title: "BC 1.6", href: "/dokumen-bc/bc16", permission: "bc:read" },
      { title: "BC 2.3", href: "/dokumen-bc/bc23", permission: "bc:read" },
      { title: "BC 2.5", href: "/dokumen-bc/bc25", permission: "bc:read" },
      { title: "BC 2.6.1", href: "/dokumen-bc/bc261", permission: "bc:read" },
      { title: "BC 2.6.2", href: "/dokumen-bc/bc262", permission: "bc:read" },
      { title: "BC 2.7", href: "/dokumen-bc/bc27", permission: "bc:read" },
      { title: "BC 2.8", href: "/dokumen-bc/bc28", permission: "bc:read" },
      { title: "BC 4.0", href: "/dokumen-bc/bc40", permission: "bc:read" },
      { title: "BC 4.1", href: "/dokumen-bc/bc41", permission: "bc:read" },
    ],
  },
  {
    // Referensi kepabeanan satu menu per jenis, dikelompokkan dalam sub menu seperti Master Data
    // hmx (core_it_inventory/views/menu_views.xml).
    label: "Master data",
    module: "it-inventory",
    icon: Library,
    items: refCodeMenu([
      ["Produk", ["ceisa_unit", "package_type", "hs_code"]],
      [
        "Logistik & Lokasi",
        [
          "domestic_port",
          "foreign_port",
          "tps",
          "customs_office",
          "country",
          "container_size",
          "container_type",
          "transport_mode",
        ],
      ],
      ["Perdagangan", ["incoterm", "currency"]],
      ["Kepabeanan (CEISA)", ["document_type", "levy_type", "response"]],
      ["Entitas & Fasilitas", ["entity_type", "facility"]],
    ]),
  },
  {
    label: "Laporan",
    module: "it-inventory",
    icon: ChartColumn,
    items: [
      {
        title: "Laporan IT Inventory",
        href: "/laporan",
        permission: "report:read",
        plannedIn: "M5",
      },
    ],
  },
  {
    label: "Master data",
    module: "inventory",
    icon: Database,
    items: [
      {
        title: "Produk",
        href: "/master/produk",
        permission: "master:read",
      },
      {
        title: "Kategori produk",
        href: "/master/kategori-produk",
        permission: "master:read",
      },
      {
        title: "Satuan",
        href: "/master/satuan",
        permission: "master:read",
      },
      {
        title: "Gudang & lokasi",
        href: "/master/gudang",
        permission: "master:read",
      },
      {
        title: "Partner",
        href: "/master/partner",
        permission: "master:read",
      },
    ],
  },
  {
    label: "Administrasi",
    module: "base",
    icon: Settings,
    items: [
      { title: "Pengguna", href: "/admin/users", permission: "user:manage" },
      // Profil perusahaan (pengusaha TPB di dokumen BC) di modul Pengaturan, bisa dibaca semua peran
      // yang punya master:read.
      { title: "Profil perusahaan", href: "/master/perusahaan", permission: "master:read" },
      {
        title: "Pengaturan",
        href: "/admin/pengaturan",
        permission: "settings:write",
      },
    ],
  },
]

function refCodeMenu(submenus: [string, RefCodeType[]][]): NavItem[] {
  return submenus.flatMap(([submenu, types]) =>
    types.map((type) => ({
      title: refCodeMenuTitle(type),
      href: refCodeListHref(type),
      permission: "master:read" as const,
      submenu,
    })),
  )
}

export type NavEntry =
  { kind: "item"; item: NavItem } | { kind: "submenu"; title: string; items: NavItem[] }

// Item grup untuk sidebar: item berurutan dengan submenu yang sama digabung jadi satu entry.
export function navEntries(items: NavItem[]): NavEntry[] {
  const entries: NavEntry[] = []
  for (const item of items) {
    const last = entries.at(-1)
    if (!item.submenu) entries.push({ kind: "item", item })
    else if (last?.kind === "submenu" && last.title === item.submenu) last.items.push(item)
    else entries.push({ kind: "submenu", title: item.submenu, items: [item] })
  }
  return entries
}

// Menu yang boleh dilihat oleh kumpulan peran ini. Grup yang kosong dibuang.
export function navigationFor(roles: readonly Role[]): NavGroup[] {
  return NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(roles, item.permission)),
  })).filter((group) => group.items.length > 0)
}

export function findNavItem(href: string): NavItem {
  const item = NAVIGATION.flatMap((group) => group.items).find((entry) => entry.href === href)
  if (!item) throw new Error(`Menu untuk ${href} tidak ada di NAVIGATION.`)
  return item
}

// "/" hanya aktif di beranda; menu lain juga aktif di halaman turunannya.
export function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

// Modul dan grupnya untuk sebuah path, untuk breadcrumb header. Menu dengan href terpanjang yang
// cocok yang menang, jadi /master/produk/123 → Master data › Produk.
export function navigationTrail(pathname: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null
  for (const group of NAVIGATION) {
    for (const item of group.items) {
      if (!isActivePath(pathname, item.href)) continue
      if (!best || item.href.length > best.item.href.length) best = { group, item }
    }
  }
  return best
}

// Menu per modul (backlog S-02), seperti active-section webx hmx: pemilih modul di atas sidebar,
// sidebar hanya menampilkan area kerja modul aktif.
// Ikon modul sengaja berbeda dari ikon area kerja, supaya pemilih tidak tertukar dengan menu saat
// sidebar diciutkan.
export const MODULE_MENUS: Record<AppModule, { label: string; icon: LucideIcon }> = {
  inventory: { label: "Inventory", icon: ClipboardList },
  "it-inventory": { label: "IT Inventory", icon: FileCheck2 },
  base: { label: "Pengaturan", icon: SlidersHorizontal },
}

// Modul yang punya menu untuk peran ini, urut seperti APP_MODULES tapi Inventory dulu.
const MODULE_ORDER: AppModule[] = ["inventory", "it-inventory", "base"]

export function modulesFor(groups: NavGroup[]): AppModule[] {
  return MODULE_ORDER.filter(
    (module) => APP_MODULES.includes(module) && groups.some((group) => group.module === module),
  )
}

// Modul pemilik halaman ini (dari menu yang cocok), atau null bila tidak ada menunya.
export function moduleForPath(pathname: string): AppModule | null {
  return navigationTrail(pathname)?.group.module ?? null
}
