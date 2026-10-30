import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"

// Arsip vs hapus (backlog M1-08): data yang belum dipakai bisa dihapus setelah konfirmasi,
// dan semua daftar master punya filter status.

const SKU = `LTD-${Date.now().toString(36).slice(-5).toUpperCase()}`

test.use({ storageState: ADMIN_STATE_FILE })

test("produk yang belum dipakai dihapus setelah konfirmasi", async ({ page }) => {
  await page.goto("/master/produk/baru")
  await page.getByLabel("Product code").fill(SKU)
  await page.getByLabel("Nama produk").fill("Produk salah input")
  await page.getByLabel("Kategori IT Inventory").click()
  await page.getByRole("option", { name: "WIP" }).click()
  await page.getByLabel("Satuan stok").click()
  await page.getByRole("option", { name: /^\[PCS\]/ }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(new RegExp(`/master/produk\\?q=${SKU}$`))

  // Hapus dari daftar: pilih baris, lalu Hapus di baris aksi di atas tabel.
  await page.getByRole("checkbox", { name: `Pilih ${SKU}` }).check()
  await expect(page.getByText("1 dipilih")).toBeVisible()
  await page.getByRole("button", { name: "Hapus", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toContainText(`Hapus produk ${SKU}?`)
  // Batal tidak menghapus apa pun.
  await dialog.getByRole("button", { name: "Batal" }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole("button", { name: "Hapus", exact: true }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Hapus", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("1 produk dihapus.")
  await expect(page.getByText("Tidak ada produk yang cocok")).toBeVisible()
})

test("filter status menyaring daftar ke data aktif atau arsip", async ({ page }) => {
  await page.goto("/master/satuan")
  // Filter ada di panel corong kotak cari (RU-22); filter aktif tampil sebagai chip.
  await page.getByRole("button", { name: "Filter dan kelompokkan" }).click()
  await page.getByRole("button", { name: "Diarsipkan" }).click()
  await expect(page).toHaveURL(/status=arsip/)
  await expect(page.getByRole("button", { name: "Hapus Status: Diarsipkan" })).toBeVisible()
})
