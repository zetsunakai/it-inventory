import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS } from "../../shared/e2e/accounts"
import { login } from "../../shared/e2e/login"

// Layout aplikasi (backlog M0-09): menu sidebar mengikuti peran.

function sidebar(page: Page) {
  return page.locator('[data-slot="sidebar-inner"]')
}

// Login lalu tunggu sidebar tampil: redirect setelah login butuh waktu, jadi menu atau halaman
// berikutnya baru dibuka setelah aplikasi termuat.
async function loginAs(page: Page, account: { email: string; password: string }) {
  await page.goto("/login")
  await login(page, account)
  await expect(sidebar(page)).toBeVisible()
}

// Menu anak tersembunyi sampai menu induknya diklik; buka semua grup dulu.
// Klik bisa jatuh sebelum halaman selesai hydrate, jadi tiap grup diulang sampai benar-benar terbuka.
async function expandMenus(page: Page) {
  // Menu per peran ikut di-stream; tunggu grupnya ada sebelum dihitung.
  const groups = sidebar(page).locator("button[data-nav-group]")
  await expect(groups.first()).toBeVisible()
  for (const group of await groups.all()) {
    await expect(async () => {
      if ((await group.getAttribute("aria-expanded")) === "false") await group.click()
      await expect(group).toHaveAttribute("aria-expanded", "true", { timeout: 1000 })
    }).toPass()
  }
}

// Menu per modul (S-02): pemilih modul di atas sidebar.
async function moduleOptions(page: Page) {
  await sidebar(page)
    .getByRole("button", { name: /^Ganti modul/ })
    .click()
  const items = page.getByRole("menuitemradio")
  await expect(items.first()).toBeVisible()
  const options = await items.allTextContents()
  await page.keyboard.press("Escape")
  return options.map((option) => option.trim())
}

async function switchModule(page: Page, label: string) {
  await sidebar(page)
    .getByRole("button", { name: /^Ganti modul/ })
    .click()
  await expect(page.getByText("Pilih modul", { exact: true })).toHaveCount(0)
  await page.getByRole("menuitemradio", { name: label, exact: true }).click()
  await expect(page.getByRole("menuitemradio")).toHaveCount(0)
}

test("popup modul terbuka ke kanan dan bisa dipilih dengan keyboard", async ({ page }) => {
  await loginAs(page, ACCOUNTS.auditor)
  const trigger = sidebar(page).getByRole("button", { name: /^Ganti modul/ })
  await trigger.click()
  const menu = page.getByRole("menu", { name: "Modul aplikasi" })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(1)
  const triggerBounds = await trigger.boundingBox()
  const menuBounds = await menu.boundingBox()
  expect(triggerBounds).not.toBeNull()
  expect(menuBounds).not.toBeNull()
  expect(Math.abs(menuBounds!.width - triggerBounds!.width)).toBeLessThan(2)
  expect(menuBounds!.x).toBeGreaterThanOrEqual(triggerBounds!.x + triggerBounds!.width)

  const lastOption = (await menu.getByRole("menuitemradio").last().innerText()).trim()
  const url = page.url()
  await page.keyboard.press("End")
  await page.keyboard.press("Enter")
  await expect(menu).toHaveCount(0)
  await expect(trigger).toHaveAccessibleName(`Ganti modul, sekarang ${lastOption}`)
  await expect(page).toHaveURL(url)
  await trigger.click()
  await expect(menu.getByRole("menuitemradio", { name: lastOption, checked: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeFocused()
})

// Semua menu yang boleh dilihat, dari semua modul di pemilih.
async function menuLinks(page: Page) {
  const all: string[] = []
  for (const option of await moduleOptions(page)) {
    await switchModule(page, option)
    await expandMenus(page)
    const links = sidebar(page).locator('[data-sidebar="content"]').getByRole("link")
    await expect(links.first()).toBeVisible()
    // Teks pertama tiap menu adalah nama modulnya (label "segera" menyusul).
    all.push(
      ...(await links.evaluateAll((elements) =>
        elements.map((element) => element.querySelector("span")?.textContent ?? ""),
      )),
    )
  }
  return all
}

test("menu Auditor: bisa melihat modul baca, tanpa Pengguna, Pengaturan, dan Tutup periode", async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.auditor)

  const links = await menuLinks(page)
  expect(links).toEqual(
    expect.arrayContaining([
      "Beranda",
      "Stok",
      "BC 2.3",
      "Laporan IT Inventory",
      "Produk",
      "Profil perusahaan",
    ]),
  )
  expect(links).not.toContain("Pengguna")
  expect(links).not.toContain("Pengaturan")
  expect(links).not.toContain("Tutup periode")
  // Pengaturan tampil hanya untuk Profil perusahaan (hanya baca).
  expect(await moduleOptions(page)).toEqual(["Inventory", "IT Inventory", "Pengaturan"])
})

test("menu Admin gudang: tanpa dokumen BC; membuka URL-nya langsung ditolak", async ({ page }) => {
  await loginAs(page, ACCOUNTS.gudang)

  const links = await menuLinks(page)
  expect(links).toContain("Penerimaan")
  expect(links).not.toContain("BC 2.3")

  await page.goto("/dokumen-bc/bc23")
  await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible()
})

test("klik menu membuka modul dan menandai menu yang aktif", async ({ page }) => {
  await loginAs(page, ACCOUNTS.auditor)

  // Modul yang masih berupa placeholder, di modul IT Inventory; grupnya dibuka dulu.
  await switchModule(page, "IT Inventory")
  await expandMenus(page)
  await sidebar(page).getByRole("link", { name: "Laporan IT Inventory" }).click()

  await expect(page).toHaveURL(/\/laporan$/)
  await expect(page.getByRole("heading", { name: "Laporan IT Inventory", level: 1 })).toBeVisible()
  await expect(page.getByText("Dijadwalkan di M5.")).toBeVisible()
  await expect(sidebar(page).getByRole("link", { name: "Laporan IT Inventory" })).toHaveAttribute(
    "title",
    "Belum tersedia, dijadwalkan di M5",
  )
  await expect(sidebar(page).getByRole("link", { name: "Laporan IT Inventory" })).toHaveAttribute(
    "aria-current",
    "page",
  )
  // Beranda milik modul Inventory, jadi tidak tampil saat modul IT Inventory aktif.
  await expect(sidebar(page).getByRole("link", { name: "Beranda" })).toHaveCount(0)
})

test("tautan langsung ke halaman modul lain memindahkan menu ke modul itu", async ({ page }) => {
  await loginAs(page, ACCOUNTS.auditor)
  await expect(
    sidebar(page).getByRole("button", { name: /^Ganti modul, sekarang Inventory/ }),
  ).toBeVisible()
  await page.goto("/master/referensi/kode-hs")
  await expect(
    sidebar(page).getByRole("button", { name: /^Ganti modul, sekarang IT Inventory/ }),
  ).toBeVisible()
})

test("semua bagian menu terbuka secara bawaan seperti hmx; bisa ditutup dan dibuka lagi", async ({
  page,
}) => {
  await loginAs(page, ACCOUNTS.auditor)
  await page.goto("/inventory/stok")

  const inventory = sidebar(page).getByRole("button", { name: "Stok & kontrol" })
  const master = sidebar(page).getByRole("button", { name: "Master data" })
  await expect(inventory).toHaveAttribute("aria-expanded", "true")
  await expect(master).toHaveAttribute("aria-expanded", "true")
  await expect(sidebar(page).getByRole("link", { name: "Produk", exact: true })).toBeVisible()

  await master.click()
  await expect(sidebar(page).getByRole("link", { name: "Produk", exact: true })).toHaveCount(0)
  await master.click()
  await expect(sidebar(page).getByRole("link", { name: "Produk", exact: true })).toBeVisible()
})
