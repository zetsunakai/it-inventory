// Peran dan izin (PRD bagian 3). Dipakai bersama oleh server (pengecekan akses)
// dan UI (menampilkan menu). Pengecekan yang menentukan tetap di server.

export const ROLES = ["administrator", "manajer", "staf_exim", "admin_gudang", "auditor"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  manajer: "Manajer operasional",
  staf_exim: "Staf exim / PPJK",
  admin_gudang: "Admin gudang",
  auditor: "Auditor",
}

export const PERMISSIONS = [
  "inventory:read",
  "inventory:write",
  "inventory:approve",
  "bc:read",
  "bc:write",
  // Membatalkan dokumen BC: hanya Manajer (PRD bagian 7.3).
  "bc:cancel",
  "report:read",
  "master:read",
  "master:write",
  // Referensi kepabeanan: hanya Administrator (PRD bagian 5.2).
  "ref:write",
  "user:manage",
  "settings:write",
] as const
export type Permission = (typeof PERMISSIONS)[number]

// Modul app (S-01): base (login, peran, pengguna, pengaturan, master data bersama), inventory, dan
// IT Inventory (dokumen BC, laporan, referensi kepabeanan).
export const APP_MODULES = ["base", "inventory", "it-inventory"] as const
export type AppModule = (typeof APP_MODULES)[number]

export const APP_MODULE_LABELS: Record<AppModule, string> = {
  base: "Base",
  inventory: "Inventory",
  "it-inventory": "IT Inventory",
}

// Pemilik setiap izin. Izin master data dipakai bersama modul inventory dan IT Inventory.
export const PERMISSION_MODULES: Record<Permission, AppModule> = {
  "inventory:read": "inventory",
  "inventory:write": "inventory",
  "inventory:approve": "inventory",
  "bc:read": "it-inventory",
  "bc:write": "it-inventory",
  "bc:cancel": "it-inventory",
  "report:read": "it-inventory",
  "master:read": "base",
  "master:write": "base",
  "ref:write": "it-inventory",
  "user:manage": "base",
  "settings:write": "base",
}

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Akses penuh.
  administrator: PERMISSIONS,
  manajer: [
    "inventory:read",
    "inventory:write",
    "inventory:approve",
    "bc:read",
    "bc:cancel",
    "report:read",
    "master:read",
  ],
  staf_exim: ["inventory:read", "bc:read", "bc:write", "report:read", "master:read"],
  admin_gudang: ["inventory:read", "inventory:write", "report:read", "master:read"],
  // Hanya baca, tidak bisa mengubah apa pun.
  auditor: ["inventory:read", "bc:read", "report:read", "master:read"],
}

// Peran yang otomatis bisa melihat semua gudang. Peran lain hanya gudang yang diberikan
// lewat user_warehouses. Sama dengan fungsi database can_access_warehouse() (migrasi 0013).
export const ALL_WAREHOUSE_ROLES: readonly Role[] = ["administrator", "manajer", "auditor"]

// Peran yang wajib memakai MFA (PRD bagian 11).
export const MFA_REQUIRED_ROLES: readonly Role[] = ["administrator", "manajer"]

export function hasPermission(roles: readonly Role[], permission: Permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission))
}

export function requiresMfa(roles: readonly Role[]) {
  return roles.some((role) => MFA_REQUIRED_ROLES.includes(role))
}

export function hasAllWarehouseAccess(roles: readonly Role[]) {
  return roles.some((role) => ALL_WAREHOUSE_ROLES.includes(role))
}
