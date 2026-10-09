import {
  Boxes,
  ChartColumn,
  Database,
  House,
  Landmark,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { hasPermission, type Permission, type Role } from "./permissions"

// Satu sumber untuk menu sidebar dan halaman modul. Menu hanya menyembunyikan
// yang tidak boleh dibuka; pengecekan izin yang menentukan tetap di setiap halaman.

export type NavItem = {
  title: string
  href: string
  // Tanpa permission = boleh dibuka semua user yang login.
  permission?: Permission
  // Tiket backlog yang mengisi modul ini, ditampilkan selama modul masih kosong.
  plannedIn?: string
}

export type NavGroup = {
  label: string
  // Ikon area kerja, hanya di tingkat grup (menu anak tanpa ikon). Grup Umum memakai ikon
  // untuk Beranda.
  icon: LucideIcon
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: "Umum",
    icon: House,
    items: [{ title: "Beranda", href: "/" }],
  },
  {
    label: "Inventory",
    icon: Boxes,
    items: [
      {
        title: "Stok",
        href: "/inventory/stok",
        permission: "inventory:read",
        plannedIn: "M2-11",
      },
      {
        title: "Penerimaan",
        href: "/inventory/penerimaan",
        permission: "inventory:read",
        plannedIn: "M2-03",
      },
      {
        title: "Pengiriman",
        href: "/inventory/pengiriman",
        permission: "inventory:read",
        plannedIn: "M2-04",
      },
      {
        title: "Transfer internal",
        href: "/inventory/transfer",
        permission: "inventory:read",
        plannedIn: "M2-06",
      },
      {
        title: "Scrap & penyesuaian",
        href: "/inventory/penyesuaian",
        permission: "inventory:read",
        plannedIn: "M2-08",
      },
      {
        title: "Stock opname",
        href: "/inventory/opname",
        permission: "inventory:read",
        plannedIn: "M2-09",
      },
      {
        title: "Tutup periode",
        href: "/inventory/periode",
        permission: "inventory:approve",
        plannedIn: "M2-10",
      },
    ],
  },
  {
    label: "Kepabeanan",
    icon: Landmark,
    items: [
      {
        title: "Dokumen BC",
        href: "/dokumen-bc",
        permission: "bc:read",
        plannedIn: "M3",
      },
    ],
  },
  {
    label: "Laporan",
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
    icon: Database,
    items: [
      {
        title: "Produk",
        href: "/master/produk",
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
      {
        title: "Referensi kepabeanan",
        href: "/master/referensi",
        permission: "master:read",
      },
      {
        title: "Profil perusahaan",
        href: "/master/perusahaan",
        permission: "master:read",
      },
    ],
  },
  {
    label: "Administrasi",
    icon: Settings,
    items: [
      { title: "Pengguna", href: "/admin/users", permission: "user:manage" },
      {
        title: "Pengaturan",
        href: "/admin/pengaturan",
        permission: "settings:write",
      },
    ],
  },
]

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
