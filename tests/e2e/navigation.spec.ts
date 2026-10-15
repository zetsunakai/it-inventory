import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS } from "./accounts"
import { login } from "./login"

// Layout aplikasi (backlog M0-09): menu sidebar mengikuti peran.

function sidebar(page: Page) {
  return page.locator('[data-slot="sidebar-inner"]')
}

// Menu anak tersembunyi sampai menu induknya diklik; buka semua grup dulu.
async function expandMenus(page: Page) {
  const closed = sidebar(page).locator('button[aria-expanded="false"]')
  while ((await closed.count()) > 0) await closed.first().click()
}

async function menuLinks(page: Page) {
  await expandMenus(page)
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
  await login(page, ACCOUNTS.auditor)

  // Modul yang masih berupa placeholder; grupnya dibuka dulu.
  await expandMenus(page)
  await sidebar(page).getByRole("link", { name: "Dokumen BC" }).click()

  await expect(page).toHaveURL(/\/dokumen-bc$/)
  await expect(page.getByRole("heading", { name: "Dokumen BC", level: 1 })).toBeVisible()
  await expect(page.getByText("Dijadwalkan di M3.")).toBeVisible()
  await expect(sidebar(page).getByRole("link", { name: "Dokumen BC" })).toHaveAttribute(
    "title",
    "Belum tersedia, dijadwalkan di M3",
  )
  await expect(sidebar(page).getByRole("link", { name: "Dokumen BC" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  await expect(sidebar(page).getByRole("link", { name: "Beranda" })).not.toHaveAttribute(
    "aria-current",
  )
})

test("menu anak tersembunyi sampai menu induknya diklik; grup halaman aktif terbuka", async ({
  page,
}) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await page.goto("/inventory/stok")

  const inventory = sidebar(page).getByRole("button", { name: "Inventory" })
  const master = sidebar(page).getByRole("button", { name: "Master data" })
  await expect(inventory).toHaveAttribute("aria-expanded", "true")
  await expect(master).toHaveAttribute("aria-expanded", "false")
  await expect(sidebar(page).getByRole("link", { name: "Produk" })).toHaveCount(0)

  await master.click()
  await expect(sidebar(page).getByRole("link", { name: "Produk" })).toBeVisible()
  await inventory.click()
  await expect(sidebar(page).getByRole("link", { name: "Stok" })).toHaveCount(0)
})
