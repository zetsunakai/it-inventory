import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Import/export master data (backlog M1-07), lewat halaman produk sebagai contoh.

// SKU unik per run, karena di CI tes bisa diulang tanpa reset database.
const SKU = `LTI-${Date.now().toString(36).slice(-5).toUpperCase()}`

function csvFile(lines: string[]) {
  return { name: "produk.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n")) }
}

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("file dengan baris salah ditolak per baris, lalu file yang benar tersimpan", async ({
    page,
  }) => {
    await page.goto("/master/produk")
    await page.getByRole("link", { name: "Import", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Import produk" })).toBeVisible()

    const header = "SKU;Nama;Kategori;Satuan stok;Kode HS"
    await page
      .getByLabel("File Excel atau CSV")
      .setInputFiles(
        csvFile([header, `${SKU};Laptop impor;Bahan baku;PCS;84713020`, `${SKU}-2;;Bahan;PCS;`]),
      )
    await page.getByRole("button", { name: "Import", exact: true }).click()

    // Filter teks: Next.js juga punya elemen role="alert" untuk pengumuman pindah halaman.
    await expect(
      page.getByRole("alert").filter({ hasText: "Tidak ada data yang disimpan" }),
    ).toContainText("Tidak ada data yang disimpan: 1 dari 2 baris perlu diperbaiki.")
    const errorRow = page.getByRole("row").filter({ hasText: `${SKU}-2` })
    await expect(errorRow).toContainText("Nama produk wajib diisi.")
    await expect(errorRow).toContainText('Kategori "Bahan" tidak dikenal.')

    await page
      .getByLabel("File Excel atau CSV")
      .setInputFiles(csvFile([header, `${SKU};Laptop impor;Bahan baku;PCS;84713020`]))
    await page.getByRole("button", { name: "Import", exact: true }).click()
    await expect(page.getByRole("status")).toContainText("Import selesai: 1 baris diproses.")

    await page.goto(`/master/produk?q=${SKU}`)
    await expect(page.getByRole("row").filter({ hasText: SKU })).toContainText("Laptop impor")
  })

  test("export produk mengunduh file Excel bertanggal", async ({ page }) => {
    await page.goto("/master/produk")
    await page.getByRole("button", { name: "Export" }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("menuitem", { name: "Excel (.xlsx)" }).click()
    expect((await download).suggestedFilename()).toMatch(/^produk-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })
})

test("Auditor boleh export tapi tidak boleh import", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/master/partner")
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveCount(0)

  await page.goto("/master/partner/import")
  await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible()
})
