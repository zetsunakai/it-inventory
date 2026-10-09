import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  Building,
  CalendarCheck,
  ChartColumn,
  ClipboardCheck,
  FileText,
  Handshake,
  LayoutDashboard,
  Package,
  PackageMinus,
  PackagePlus,
  Ruler,
  Settings,
  SlidersHorizontal,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react"

import { hasPermission, type Permission, type Role } from "./permissions"

// Satu sumber untuk menu sidebar dan halaman modul. Menu hanya menyembunyikan
// yang tidak boleh dibuka; pengecekan izin yang menentukan tetap di setiap halaman.

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  // Tanpa permission = boleh dibuka semua user yang login.
  permission?: Permission
  // Tiket backlog yang mengisi modul ini, ditampilkan selama modul masih kosong.
  plannedIn?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: "Umum",
    items: [{ title: "Beranda", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Inventory",
    items: [
      {
        title: "Stok",
        href: "/inventory/stok",
        icon: Boxes,
        permission: "inventory:read",
        plannedIn: "M2-11",
      },
      {
        title: "Penerimaan",
        href: "/inventory/penerimaan",
        icon: PackagePlus,
        permission: "inventory:read",
        plannedIn: "M2-03",
      },
      {
        title: "Pengiriman",
        href: "/inventory/pengiriman",
        icon: PackageMinus,
        permission: "inventory:read",
        plannedIn: "M2-04",
      },
      {
        title: "Transfer internal",
        href: "/inventory/transfer",
        icon: ArrowLeftRight,
        permission: "inventory:read",
        plannedIn: "M2-06",
      },
      {
        title: "Scrap & penyesuaian",
        href: "/inventory/penyesuaian",
        icon: SlidersHorizontal,
        permission: "inventory:read",
        plannedIn: "M2-08",
      },
      {
        title: "Stock opname",
        href: "/inventory/opname",
        icon: ClipboardCheck,
        permission: "inventory:read",
        plannedIn: "M2-09",
      },
      {
        title: "Tutup periode",
        href: "/inventory/periode",
        icon: CalendarCheck,
        permission: "inventory:approve",
        plannedIn: "M2-10",
      },
    ],
  },
  {
    label: "Kepabeanan",
    items: [
      {
        title: "Dokumen BC",
        href: "/dokumen-bc",
        icon: FileText,
        permission: "bc:read",
        plannedIn: "M3",
      },
    ],
  },
  {
    label: "Laporan",
    items: [
      {
        title: "Laporan IT Inventory",
        href: "/laporan",
        icon: ChartColumn,
        permission: "report:read",
        plannedIn: "M5",
      },
    ],
  },
  {
    label: "Master data",
    items: [
      {
        title: "Produk",
        href: "/master/produk",
        icon: Package,
        permission: "master:read",
      },
      {
        title: "Satuan",
        href: "/master/satuan",
        icon: Ruler,
        permission: "master:read",
      },
      {
        title: "Gudang & lokasi",
        href: "/master/gudang",
        icon: Warehouse,
        permission: "master:read",
      },
      {
        title: "Partner",
        href: "/master/partner",
        icon: Handshake,
        permission: "master:read",
      },
      {
        title: "Referensi kepabeanan",
        href: "/master/referensi",
        icon: BookOpen,
        permission: "master:read",
      },
      {
        title: "Profil perusahaan",
        href: "/master/perusahaan",
        icon: Building,
        permission: "master:read",
      },
    ],
  },
  {
    label: "Administrasi",
    items: [
      { title: "Pengguna", href: "/admin/users", icon: Users, permission: "user:manage" },
      {
        title: "Pengaturan",
        href: "/admin/pengaturan",
        icon: Settings,
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
