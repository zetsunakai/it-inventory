import { describe, expect, test } from "vitest"

import { findNavItem, isActivePath, NAVIGATION, navigationFor, navigationTrail } from "./navigation"
import { APP_MODULES, PERMISSION_MODULES, PERMISSIONS } from "./permissions"

function hrefs(groups: ReturnType<typeof navigationFor>) {
  return groups.flatMap((group) => group.items.map((item) => item.href))
}

describe("navigationFor", () => {
  test("Administrator melihat semua menu", () => {
    expect(hrefs(navigationFor(["administrator"]))).toEqual(hrefs(NAVIGATION))
  })

  test("Auditor tidak melihat menu Administrasi maupun Tutup periode", () => {
    const groups = navigationFor(["auditor"])
    expect(groups.map((group) => group.label)).not.toContain("Administrasi")
    expect(hrefs(groups)).not.toContain("/inventory/periode")
    expect(hrefs(groups)).toContain("/laporan")
  })

  test("grup tanpa menu yang boleh dibuka tidak ditampilkan", () => {
    expect(navigationFor([]).map((group) => group.label)).toEqual(["Umum"])
  })

  test("setiap menu memakai izin yang dikenal dan href yang unik", () => {
    const items = NAVIGATION.flatMap((group) => group.items)
    for (const item of items) {
      if (item.permission) expect(PERMISSIONS).toContain(item.permission)
    }
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length)
  })
})

describe("findNavItem", () => {
  test("mengembalikan menu untuk href yang terdaftar", () => {
    expect(findNavItem("/master/produk").title).toBe("Produk")
  })

  test("href yang tidak terdaftar adalah kesalahan program", () => {
    expect(() => findNavItem("/tidak-ada")).toThrow()
  })
})

describe("isActivePath", () => {
  test("beranda hanya aktif di /", () => {
    expect(isActivePath("/", "/")).toBe(true)
    expect(isActivePath("/admin/users", "/")).toBe(false)
  })

  test("menu lain juga aktif di halaman turunannya", () => {
    expect(isActivePath("/dokumen-bc", "/dokumen-bc")).toBe(true)
    expect(isActivePath("/dokumen-bc/123", "/dokumen-bc")).toBe(true)
    expect(isActivePath("/dokumen-bc-lain", "/dokumen-bc")).toBe(false)
  })
})

describe("navigationTrail", () => {
  test("halaman turunan memakai modul induknya", () => {
    const trail = navigationTrail("/master/produk/123")
    expect(trail?.group.label).toBe("Master data")
    expect(trail?.item.title).toBe("Produk")
  })

  test("beranda dan path tak dikenal", () => {
    expect(navigationTrail("/")?.item.title).toBe("Beranda")
    expect(navigationTrail("/tidak-ada")).toBeNull()
  })
})

describe("modul (S-01)", () => {
  test("setiap area kerja punya modul, dan izin menunya milik modul itu atau base", () => {
    for (const group of NAVIGATION) {
      expect(APP_MODULES).toContain(group.module)
      for (const item of group.items) {
        if (!item.permission) continue
        expect([group.module, "base"]).toContain(PERMISSION_MODULES[item.permission])
      }
    }
  })

  test("referensi kepabeanan dan profil perusahaan ada di area Kepabeanan", () => {
    expect(navigationTrail("/master/referensi")?.group.label).toBe("Kepabeanan")
    expect(navigationTrail("/master/perusahaan")?.group.module).toBe("it-inventory")
  })
})
