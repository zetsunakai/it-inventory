import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture } from "./fixtures"
import { fillInteractive, openEditableRow } from "./interactive"

// Satuan khusus produk (backlog R-03).
test.use({ storageState: ADMIN_STATE_FILE })

test("satuan khusus produk dibuat dari halaman Satuan dan dipakai di penerimaan", async ({
  page,
}) => {
  const fixture = await createInventoryFixture("UOM")
  const code = `BX${fixture.product.sku.split("-").at(-1)}`

  await page.goto("/master/satuan/baru")
  await fillInteractive(page.getByLabel("Khusus produk"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Kode satuan").fill(code)
  await page.getByLabel("Nama satuan").fill("Box isi 24")
  await expect(page.getByText(`1 ${code} = berapa PCS?`)).toBeVisible()
  await page.getByLabel("Faktor konversi").fill("24")
  await page.getByRole("button", { name: "Simpan" }).click()
  await expect(page).toHaveURL(/\/master\/satuan\?kategori=/)
  const row = page.getByRole("row").filter({ hasText: code })
  await expect(row).toContainText(fixture.product.sku)
  await expect(row).toContainText(`1 ${code} = 24 PCS`)

  await page.goto("/inventory/penerimaan/baru")
  await openEditableRow(page)
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Satuan baris 1").click()
  await expect(page.getByRole("option", { name: code, exact: true })).toBeVisible()
})
