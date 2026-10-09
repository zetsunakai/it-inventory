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

  test("produk baru belum siap dokumen BC sampai kode HS dan satuan CEISA lengkap", async ({
    page,
  }) => {
    await page.goto("/master/produk/baru")
    await page.getByLabel("SKU").fill(SKU)
    await page.getByLabel("Nama produk").fill("Laptop uji E2E")
    await page.getByLabel("Kategori IT Inventory").click()
    await page.getByRole("option", { name: "Bahan baku" }).click()
    await page.getByLabel("Satuan stok").click()
    await page.getByRole("option", { name: /^\[PCS\]/ }).click()
    await page.getByLabel("Berat netto (kg)").fill("1,8")
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page).toHaveURL(new RegExp(`/master/produk\\?q=${SKU}$`))
    const row = page.getByRole("row").filter({ hasText: SKU })
    await expect(row).toContainText("Belum siap")

    await row.getByRole("link", { name: SKU }).click()
    await expect(
      page.getByText("Belum siap dokumen BC: kode HS dan satuan CEISA belum diisi."),
    ).toBeVisible()

    // exact: halaman daftar (tersimpan tersembunyi oleh router) punya kotak "Cari ... kode HS".
    await page.getByLabel("Kode HS", { exact: true }).fill("laptops")
    await page.getByRole("option", { name: /^\[84713020\]/ }).click()
    await page.getByLabel("Satuan CEISA", { exact: true }).fill("PCE")
    await page.getByRole("option", { name: "[PCE] Piece" }).click()
    await expect(page.getByText("1 PCS = berapa PCE?")).toBeVisible()
    await page.getByLabel("Faktor satuan CEISA").fill("1")
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
  await expect(page.getByRole("link", { name: "Tambah produk" })).toHaveCount(0)
  await page.getByRole("link", { name: SKU }).click()

  await expect(page.getByText("1 PCS = 1 PCE (Piece)")).toBeVisible()
  await expect(page.getByText("1,8 kg per PCS")).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0)
})
