import { describe, expect, test } from "vitest"

import { pageCount, pageHref, parseListParams, pickFilter } from "./list-params"

describe("parseListParams", () => {
  test("default saat URL kosong", () => {
    expect(parseListParams({})).toEqual({ search: "", page: 1, pageSize: 20, offset: 0 })
  })

  test("membaca kata kunci dan halaman", () => {
    expect(parseListParams({ q: "  budi ", page: "3" }, { pageSize: 10 })).toEqual({
      search: "budi",
      page: 3,
      pageSize: 10,
      offset: 20,
    })
  })

  test("nilai tidak valid kembali ke default, bukan error", () => {
    for (const page of ["0", "-2", "abc", "1.5"]) {
      expect(parseListParams({ page }).page).toBe(1)
    }
    expect(parseListParams({ q: "x".repeat(101) }).search).toBe("")
  })

  test("parameter yang muncul berulang memakai nilai pertama", () => {
    expect(parseListParams({ q: ["a", "b"], page: ["2", "5"] })).toMatchObject({
      search: "a",
      page: 2,
    })
  })
})

describe("pickFilter", () => {
  const roles = ["auditor", "manajer"] as const

  test("nilai dari daftar dipakai", () => {
    expect(pickFilter({ peran: "auditor" }, "peran", roles)).toBe("auditor")
  })

  test("nilai di luar daftar diabaikan", () => {
    expect(pickFilter({ peran: "superadmin" }, "peran", roles)).toBeUndefined()
    expect(pickFilter({}, "peran", roles)).toBeUndefined()
  })
})

describe("pageCount", () => {
  test("minimal satu halaman walaupun data kosong", () => {
    expect(pageCount(0, 20)).toBe(1)
    expect(pageCount(20, 20)).toBe(1)
    expect(pageCount(21, 20)).toBe(2)
  })
})

describe("pageHref", () => {
  test("filter yang aktif ikut terbawa", () => {
    expect(pageHref({ q: "budi", peran: "auditor", page: "1" }, 2)).toBe(
      "?q=budi&peran=auditor&page=2",
    )
  })

  test("halaman 1 tidak ditulis di URL", () => {
    expect(pageHref({ q: "budi", page: "3" }, 1)).toBe("?q=budi")
    expect(pageHref({}, 1)).toBe("?")
  })
})
