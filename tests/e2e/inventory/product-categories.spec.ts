import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"

// Kategori produk bertingkat dan SKU otomatis (backlog R-01).
test.use({ storageState: ADMIN_STATE_FILE })

// Unik per run, karena di CI tes bisa diulang tanpa reset database.
const RUN = Date.now().toString(36).slice(-5).toUpperCase()
const PREFIX = `K${RUN}-`
const ROOT = `Kategori E2E ${RUN}`

test("kategori dengan prefix kode membuat SKU otomatis untuk produk baru", async ({ page }) => {
  await page.goto("/master/kategori-produk/baru")
  await page.getByLabel("Nama kategori").fill(ROOT)
  await page.getByLabel("Prefix kode").fill(PREFIX.toLowerCase())
  await page.getByLabel("Jumlah digit").fill("4")
  await expect(page.getByText(`mis. ${PREFIX}0001.`)).toBeVisible()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(/\/master\/kategori-produk$/)

  // Sub-kategori tanpa prefix: SKU produknya diisi manual.
  await page.goto("/master/kategori-produk/baru")
  await page.getByLabel("Nama kategori").fill("Logam")
  await page.getByLabel("Kategori induk").click()
  await page.getByRole("option", { name: ROOT, exact: true }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(/\/master\/kategori-produk$/)
  await page.getByPlaceholder("Cari nama atau prefix kode").fill(RUN)
  await expect(page.getByRole("row").filter({ hasText: "Logam" })).toContainText("Manual")
  await expect(page.getByRole("row").filter({ hasText: ROOT })).toContainText(`${PREFIX}0001`)

  await page.goto("/master/produk/baru")
  await page.getByLabel("Nama produk").fill("Pelat uji E2E")
  await page.getByLabel("Kategori produk").click()
  await page.getByRole("option", { name: `${ROOT} / Logam` }).click()
  await page.getByLabel("Kategori IT Inventory").click()
  await page.getByRole("option", { name: "Bahan baku" }).click()
  await page.getByLabel("Satuan stok").click()
  await page.getByRole("option", { name: /^\[PCS\]/ }).click()
  await page.getByRole("button", { name: "Simpan" }).click()
  // Next.js juga punya elemen role="alert" (route announcer), jadi saring dengan teksnya.
  await expect(
    page.getByRole("alert").filter({
      hasText: "Product code wajib diisi karena kategori produk Logam tidak punya prefix kode.",
    }),
  ).toBeVisible()

  await page.getByLabel("Kategori produk").click()
  await page.getByRole("option", { name: ROOT, exact: true }).click()
  await expect(page.getByText(`Kosongkan untuk dibuat otomatis, mis. ${PREFIX}0001.`)).toBeVisible()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(new RegExp(`/master/produk\\?q=${PREFIX}0001$`))
  await page.getByRole("link", { name: `${PREFIX}0001` }).click()
  await expect(page.getByRole("heading", { name: `${PREFIX}0001 · Pelat uji E2E` })).toBeVisible()
})
