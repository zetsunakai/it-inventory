import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Satuan dan konversi (backlog M1-04).

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("menambah satuan ke kategori seed lalu mengubah faktornya", async ({ page }) => {
    // Kode unik per run, karena di CI tes bisa diulang tanpa reset database.
    const code = `KW${Date.now().toString(36).slice(-4).toUpperCase()}`

    await page.goto("/master/satuan/baru")
    await page.getByLabel("Kategori").click()
    await page.getByRole("option", { name: "Berat" }).click()
    await page.getByLabel("Kode satuan").fill(code)
    await page.getByLabel("Nama satuan").fill("Kuintal")
    await expect(page.getByText(`1 ${code} = berapa KG?`)).toBeVisible()
    await page.getByLabel("Faktor konversi").fill("100")
    await page.getByRole("button", { name: "Simpan" }).click()

    // Kembali ke daftar, tersaring ke kategori Berat.
    await expect(page).toHaveURL(/\/master\/satuan\?kategori=/)
    const row = page.getByRole("row").filter({ hasText: code })
    await expect(row).toContainText(`1 ${code} = 100 KG`)

    await page.getByRole("link", { name: `Ubah satuan ${code}` }).click()
    await expect(page.getByLabel("Faktor konversi")).toHaveValue("100")
    await page.getByLabel("Faktor konversi").fill("100,5")
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByRole("status")).toHaveText("Perubahan disimpan.")

    await page.goto(`/master/satuan?q=${code}`)
    await expect(page.getByRole("row").filter({ hasText: code })).toContainText(
      `1 ${code} = 100,5 KG`,
    )
  })
})

test("Auditor melihat satuan seed tanpa bisa mengubah", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/master/satuan")
  await expect(page.getByRole("row").filter({ hasText: "LUSIN" })).toContainText("1 LUSIN = 12 PCS")
  await expect(page.getByRole("link", { name: "Tambah satuan" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Tambah kategori" })).toHaveCount(0)
})
