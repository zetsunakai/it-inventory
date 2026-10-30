import { expect, test } from "@playwright/test"

import { ACCOUNTS } from "../../shared/e2e/accounts"
import { login } from "../../shared/e2e/login"

// Tema Rantai Dokumen (H-06): jalur pemasukan → penimbunan → pengeluaran per dokumen masuk,
// pasangan dokumen tetap terlihat.
test("menu Rantai dokumen menampilkan jalur dan pasangan dokumen", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)

  const sidebar = page.locator('[data-slot="sidebar-inner"]')
  // Sidebar default mengikuti modul halaman (Beranda = Inventory); pilih modul IT Inventory dulu.
  await sidebar.getByRole("button", { name: /^Ganti modul/ }).click()
  await page.getByRole("menuitemradio", { name: "IT Inventory", exact: true }).click()
  await expect(page.getByRole("menuitemradio")).toHaveCount(0)

  const group = sidebar.getByRole("button", { name: "Keterkaitan dokumen" })
  await expect(group).toBeVisible()
  await expect(async () => {
    if ((await group.getAttribute("aria-expanded")) === "false") await group.click()
    await expect(group).toHaveAttribute("aria-expanded", "true", { timeout: 1000 })
  }).toPass()

  await sidebar.getByRole("link", { name: "Rantai dokumen" }).click()
  await expect(page).toHaveURL(/\/dokumen-bc\/flow$/)
  await expect(page.getByRole("heading", { name: "Rantai dokumen" })).toBeVisible()

  // Tiga tahap rantai.
  await expect(page.getByText("1 · Pemasukan")).toBeVisible()
  await expect(page.getByText("2 · Penimbunan")).toBeVisible()
  await expect(page.getByText("3 · Pengeluaran")).toBeVisible()

  // Jalur IN 1.6 beserta dokumen pengeluaran pasangannya.
  const chain = page.locator('[data-chain="16"]')
  await expect(chain.getByRole("link", { name: /IN 1\.6/ })).toHaveAttribute(
    "href",
    "/dokumen-bc/bc16",
  )
  await expect(chain.getByText("Keluar lewat BC 2.8, BC 2.7, P3BET")).toBeVisible()

  for (const [name, href] of [
    ["OUT 2\\.8", "/dokumen-bc/bc28"],
    ["OUT 2\\.7", "/dokumen-bc/bc27"],
    ["OUT P3BET", "/dokumen-bc/p3bet"],
  ]) {
    await expect(chain.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", href)
  }
})
