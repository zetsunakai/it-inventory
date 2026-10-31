import { describe, expect, test } from "vitest"

import {
  findNavItem,
  isActivePath,
  moduleForPath,
  modulesFor,
  NAVIGATION,
  navigationFor,
  navEntries,
  navigationTrail,
} from "./navigation"
import { APP_MODULES, PERMISSION_MODULES, PERMISSIONS } from "./permissions"
import { REF_CODE_TYPES } from "./ref-codes"

function hrefs(groups: ReturnType<typeof navigationFor>) {
  return groups.flatMap((group) => group.items.map((item) => item.href))
}

describe("navigationFor", () => {
  test("Administrator melihat semua menu", () => {
    expect(hrefs(navigationFor(["administrator"]))).toEqual(hrefs(NAVIGATION))
  })

  test("dokumen BC hanya punya satu menu daftar dan route jenis tetap memakai modul IT Inventory", () => {
    const items = hrefs(navigationFor(["administrator"]))
    expect(items.filter((href) => href.startsWith("/dokumen-bc"))).toEqual(["/dokumen-bc"])
    expect(navigationTrail("/dokumen-bc/bc23/123")?.item.title).toBe("Daftar dokumen")
    expect(moduleForPath("/dokumen-bc/bc23/123")).toBe("it-inventory")
  })

  test("Auditor tidak melihat menu Pengguna, Pengaturan, maupun Tutup periode", () => {
    const groups = navigationFor(["auditor"])
    expect(hrefs(groups)).not.toContain("/admin/users")
    expect(hrefs(groups)).not.toContain("/admin/pengaturan")
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

  test("referensi kepabeanan satu menu per jenis di Master data IT Inventory", () => {
    const trail = navigationTrail("/master/referensi/kode-hs/abc")
    expect(trail?.group).toMatchObject({ label: "Master data", module: "it-inventory" })
    expect(trail?.item.title).toBe("Referensi Kode HS")
    expect(navigationTrail("/master/referensi/tps")?.item.title).toBe("Referensi TPS")
    expect(navigationTrail("/master/referensi/jenis-kemasan")?.item.title).toBe(
      "Referensi Jenis Kemasan",
    )
    expect(trail?.group.items).toHaveLength(REF_CODE_TYPES.length)
    expect(trail?.item.submenu).toBe("Produk")
    expect(navigationTrail("/master/perusahaan")?.group.module).toBe("base")
  })
})

describe("menu per modul (S-02)", () => {
  test("modul yang tampil di pemilih mengikuti peran", () => {
    expect(modulesFor(navigationFor(["administrator"]))).toEqual([
      "inventory",
      "it-inventory",
      "base",
    ])
    // Peran lain melihat Pengaturan hanya untuk Profil perusahaan (master:read).
    expect(modulesFor(navigationFor(["auditor"]))).toEqual(["inventory", "it-inventory", "base"])
    expect(
      hrefs(navigationFor(["admin_gudang"])).filter((href) => href.startsWith("/admin")),
    ).toEqual([])
  })

  test("modul aktif mengikuti halaman yang dibuka", () => {
    expect(moduleForPath("/")).toBe("inventory")
    expect(moduleForPath("/inventory/pengiriman/123")).toBe("inventory")
    expect(moduleForPath("/master/referensi/tps/abc")).toBe("it-inventory")
    expect(moduleForPath("/admin/users")).toBe("base")
    expect(moduleForPath("/tidak-ada")).toBeNull()
  })
})

describe("navEntries (sub menu seperti hmx)", () => {
  test("item berurutan dengan submenu sama jadi satu entry, item tanpa submenu tetap sendiri", () => {
    const entries = navEntries([
      { title: "A", href: "/a" },
      { title: "B", href: "/b", submenu: "X" },
      { title: "C", href: "/c", submenu: "X" },
      { title: "D", href: "/d", submenu: "Y" },
    ])
    expect(
      entries.map((entry) => (entry.kind === "item" ? entry.item.title : entry.title)),
    ).toEqual(["A", "X", "Y"])
    expect(entries[1]).toMatchObject({ kind: "submenu", items: [{ title: "B" }, { title: "C" }] })
  })

  test("Master data IT Inventory punya lima sub menu", () => {
    const group = NAVIGATION.find(
      (entry) => entry.module === "it-inventory" && entry.label === "Master data",
    )!
    expect(navEntries(group.items).map((entry) => entry.kind === "submenu" && entry.title)).toEqual(
      ["Produk", "Logistik & Lokasi", "Perdagangan", "Kepabeanan (CEISA)", "Entitas & Fasilitas"],
    )
  })
})
