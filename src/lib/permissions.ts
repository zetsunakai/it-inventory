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
  "report:read",
  "master:read",
  "master:write",
  // Referensi kepabeanan: hanya Administrator (PRD bagian 5.2).
  "ref:write",
  "user:manage",
  "settings:write",
] as const
export type Permission = (typeof PERMISSIONS)[number]

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Akses penuh.
  administrator: PERMISSIONS,
  manajer: [
    "inventory:read",
    "inventory:write",
    "inventory:approve",
    "bc:read",
    "report:read",
    "master:read",
  ],
  staf_exim: ["inventory:read", "bc:read", "bc:write", "report:read", "master:read"],
  admin_gudang: ["inventory:read", "inventory:write", "report:read", "master:read"],
  // Hanya baca, tidak bisa mengubah apa pun.
  auditor: ["inventory:read", "bc:read", "report:read", "master:read"],
}

// Peran yang wajib memakai MFA (PRD bagian 11).
export const MFA_REQUIRED_ROLES: readonly Role[] = ["administrator", "manajer"]

export function hasPermission(roles: readonly Role[], permission: Permission) {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission))
}

export function requiresMfa(roles: readonly Role[]) {
  return roles.some((role) => MFA_REQUIRED_ROLES.includes(role))
}
