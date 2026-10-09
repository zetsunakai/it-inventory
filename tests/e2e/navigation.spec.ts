import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS } from "./accounts"
import { login } from "./login"

// Layout aplikasi (backlog M0-09): menu sidebar mengikuti peran.

function sidebar(page: Page) {
  return page.locator('[data-slot="sidebar-inner"]')
}

async function menuLinks(page: Page) {
  const links = sidebar(page).locator('[data-sidebar="content"]').getByRole("link")
  await expect(links.first()).toBeVisible()
  // Teks pertama tiap menu adalah nama modulnya (label "segera" menyusul).
  return links.evaluateAll((elements) =>
    elements.map((element) => element.querySelector("span")?.textContent ?? ""),
  )
}

test("menu Auditor: bisa melihat modul baca, tanpa Administrasi dan Tutup periode", async ({
  page,
}) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)

  const links = await menuLinks(page)
  expect(links).toEqual(
    expect.arrayContaining(["Beranda", "Stok", "Dokumen BC", "Laporan IT Inventory", "Produk"]),
  )
  expect(links).not.toContain("Pengguna")
  expect(links).not.toContain("Pengaturan")
  expect(links).not.toContain("Tutup periode")
  await expect(sidebar(page).getByText("Administrasi", { exact: true })).toHaveCount(0)
})

test("menu Admin gudang: tanpa Dokumen BC; membuka URL-nya langsung ditolak", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.gudang)

  const links = await menuLinks(page)
  expect(links).toContain("Penerimaan")
  expect(links).not.toContain("Dokumen BC")

  await page.goto("/dokumen-bc")
  await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible()
})

test("klik menu membuka modul dan menandai menu yang aktif", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.gudang)

  // Modul yang masih berupa placeholder.
  await sidebar(page).getByRole("link", { name: "Stock opname" }).click()

  await expect(page).toHaveURL(/\/inventory\/opname$/)
  await expect(page.getByRole("heading", { name: "Stock opname", level: 1 })).toBeVisible()
  await expect(page.getByText("Dijadwalkan di M2-09.")).toBeVisible()
  await expect(sidebar(page).getByRole("link", { name: "Stock opname" })).toHaveAttribute(
    "title",
    "Belum tersedia, dijadwalkan di M2-09",
  )
  await expect(sidebar(page).getByRole("link", { name: "Stock opname" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await expect(sidebar(page).getByRole("link", { name: "Beranda" })).not.toHaveAttribute(
    "aria-current",
  )
})
