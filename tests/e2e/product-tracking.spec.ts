import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture } from "./fixtures"
import { fillInteractive } from "./interactive"

// Pelacakan per nomor seri dengan nomor otomatis (backlog R-02).
test.use({ storageState: ADMIN_STATE_FILE })

test("barang masuk berpelacakan nomor seri diberi nomor otomatis per unit", async ({ page }) => {
  const fixture = await createInventoryFixture("TRK")
  const run = fixture.product.sku.split("-").at(-1)!
  const sku = `SN-${run}`
  const prefix = `S${run}-`

  await page.goto("/master/produk/baru")
  await page.getByLabel("SKU").fill(sku)
  await page.getByLabel("Nama produk").fill("Laptop berseri E2E")
  await page.getByLabel("Kategori IT Inventory").click()
  await page.getByRole("option", { name: "Mesin & peralatan" }).click()
  await page.getByLabel("Satuan stok").click()
  await page.getByRole("option", { name: /^\[PCS\]/ }).click()
  await page.getByLabel("Pelacakan").click()
  await page.getByRole("option", { name: "Per nomor seri" }).click()
  await page.getByLabel("Prefix nomor otomatis").fill(prefix)
  await page.getByLabel("Jumlah digit").fill("3")
  await expect(page.getByText(`mis. ${prefix}001. Setiap nomor seri ber-qty 1.`)).toBeVisible()
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(new RegExp(`/master/produk\\?q=${sku}$`))

  await page.goto("/inventory/penerimaan/baru")
  await fillInteractive(page.getByLabel("Vendor", { exact: true }), fixture.partner.code)
  await page.getByRole("option", { name: new RegExp(fixture.partner.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await fillInteractive(page.getByLabel("Produk baris 1"), sku)
  await page.getByRole("option", { name: new RegExp(sku) }).click()
  await page.getByLabel("Qty baris 1").fill("2")
  await expect(page.getByLabel("Nomor lot baris 1")).toHaveAttribute(
    "placeholder",
    "No. seri (otomatis)",
  )
  await page.getByRole("button", { name: "Simpan penerimaan" }).click()
  await expect(page).toHaveURL(/\/inventory\/penerimaan\/[0-9a-f-]{36}$/)
  await page.getByRole("button", { name: "Tandai siap" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer ditandai Siap." }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()

  // Satu baris permintaan (qty 2) dengan dua nomor seri, masing-masing ber-qty 1.
  const row = page.getByRole("row").filter({ hasText: sku })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(`${prefix}001`)
  await expect(row).toContainText(`${prefix}002`)
  await expect(row).toContainText("2 PCS")
})
