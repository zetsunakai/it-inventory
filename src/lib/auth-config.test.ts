import { describe, expect, test } from "vitest"

import { safeRedirectPath } from "./auth-config"

describe("safeRedirectPath", () => {
  test("path internal dipakai apa adanya", () => {
    expect(safeRedirectPath("/admin/users")).toBe("/admin/users")
    expect(safeRedirectPath("/laporan?periode=2026-10")).toBe("/laporan?periode=2026-10")
  })

  test("URL luar ditolak supaya tidak jadi open redirect", () => {
    expect(safeRedirectPath("https://contoh-jahat.com")).toBe("/")
    expect(safeRedirectPath("//contoh-jahat.com")).toBe("/")
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/")
    // Browser membaca "\" sebagai "/", jadi "/\host" sama dengan "//host".
    expect(safeRedirectPath("/\\contoh-jahat.com")).toBe("/")
  })

  test("nilai kosong diarahkan ke beranda", () => {
    expect(safeRedirectPath(null)).toBe("/")
    expect(safeRedirectPath(undefined)).toBe("/")
    expect(safeRedirectPath("")).toBe("/")
  })
})
