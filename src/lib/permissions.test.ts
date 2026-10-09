import { describe, expect, test } from "vitest"

import { hasPermission, PERMISSIONS, requiresMfa } from "./permissions"

const WRITE_PERMISSIONS = PERMISSIONS.filter((permission) => !permission.endsWith(":read"))

describe("hasPermission", () => {
  test("Administrator punya semua izin", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(["administrator"], permission)).toBe(true)
    }
  })

  test("Auditor hanya bisa membaca", () => {
    for (const permission of WRITE_PERMISSIONS) {
      expect(hasPermission(["auditor"], permission)).toBe(false)
    }
    expect(hasPermission(["auditor"], "report:read")).toBe(true)
  })

  test("Admin gudang tidak bisa mengubah dokumen BC, staf exim tidak bisa mengubah stok", () => {
    expect(hasPermission(["admin_gudang"], "bc:write")).toBe(false)
    expect(hasPermission(["staf_exim"], "inventory:write")).toBe(false)
  })

  test("hanya Manajer (dan Administrator) yang bisa approve inventory", () => {
    expect(hasPermission(["manajer"], "inventory:approve")).toBe(true)
    expect(hasPermission(["admin_gudang"], "inventory:approve")).toBe(false)
  })

  test("user dengan beberapa peran mendapat gabungan izinnya", () => {
    const roles = ["staf_exim", "admin_gudang"] as const
    expect(hasPermission(roles, "bc:write")).toBe(true)
    expect(hasPermission(roles, "inventory:write")).toBe(true)
    expect(hasPermission(roles, "user:manage")).toBe(false)
  })

  test("user tanpa peran tidak punya izin apa pun", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission([], permission)).toBe(false)
    }
  })
})

describe("requiresMfa", () => {
  test("wajib untuk Manajer dan Administrator", () => {
    expect(requiresMfa(["administrator"])).toBe(true)
    expect(requiresMfa(["manajer"])).toBe(true)
    expect(requiresMfa(["admin_gudang", "manajer"])).toBe(true)
  })

  test("tidak wajib untuk peran lain", () => {
    expect(requiresMfa(["staf_exim", "admin_gudang", "auditor"])).toBe(false)
  })
})
