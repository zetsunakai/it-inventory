import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Produk (backlog M1-05): produk tanpa kode HS atau satuan CEISA ditandai belum siap dokumen BC.
// Berurutan karena tes Auditor membaca produk yang dibuat tes Administrator.
test.describe.configure({ mode: "serial" })

// SKU unik per run, karena di CI tes bisa diulang tanpa reset database.
const SKU = `LTP-${Date.now().toString(36).slice(-5).toUpperCase()}`

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("produk baru belum siap dokumen BC sampai kode HS diisi", async ({ page }) => {
    await page.goto("/master/produk/baru")
    await page.getByLabel("Product code").fill(SKU)
    await page.getByLabel("Nama produk").fill("Laptop uji E2E")
    await page.getByLabel("Kategori IT Inventory").click()
    await page.getByRole("option", { name: "Bahan baku" }).click()
    await page.getByLabel("Satuan stok").click()
    await page.getByRole("option", { name: /^\[PCS\]/ }).click()
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page).toHaveURL(new RegExp(`/master/produk\\?q=${SKU}$`))
    const row = page.getByRole("row").filter({ hasText: SKU })
    await expect(row).toContainText("Belum siap")

    await row.getByRole("link", { name: SKU }).click()
    await expect(page.getByText("Belum siap dokumen BC: kode HS belum diisi.")).toBeVisible()
    // Detail dibuka dalam mode baca; Edit membuka form.
    await page.getByRole("button", { name: "Edit" }).click()

    // exact: halaman daftar (tersimpan tersembunyi oleh router) punya kotak "Cari ... kode HS".
    await page.getByLabel("Kode HS", { exact: true }).fill("laptops")
    await page.getByRole("option", { name: /^\[84713020\]/ }).click()
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByRole("status")).toHaveText("Perubahan disimpan.")

    await page.reload()
    await expect(page.getByText("Siap dipakai di dokumen BC.")).toBeVisible()
    await page.goto(`/master/produk?q=${SKU}&dokumen-bc=siap`)
    await expect(page.getByRole("row").filter({ hasText: SKU })).toContainText("Siap")
  })
})

test("Auditor melihat detail produk tanpa form ubah", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/master/produk?q=${SKU}`)
  await expect(page.getByRole("link", { name: "Buat", exact: true })).toHaveCount(0)
  await page.getByRole("link", { name: SKU }).click()

  // Mode baca: nilai tampil sebagai teks, kode HS dari tes sebelumnya.
  await expect(page.getByText("Laptop uji E2E", { exact: true })).toBeVisible()
  await expect(page.getByText(/^\[84713020\]/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0)
})
