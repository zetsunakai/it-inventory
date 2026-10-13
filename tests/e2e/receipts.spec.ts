import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, stockAt } from "./fixtures"

// Penerimaan (backlog M2-03): Draft → Siap → Selesai menambah saldo di lokasi tujuan.

test.use({ storageState: ADMIN_STATE_FILE })

test("penerimaan dari vendor divalidasi dan menambah stok", async ({ page }) => {
  const fixture = await createInventoryFixture("RCV")

  await page.goto("/inventory/penerimaan")
  await page.getByRole("link", { name: "Buat penerimaan" }).first().click()

  await page.getByLabel("Vendor").fill(fixture.partner.code)
  await page.getByRole("option", { name: new RegExp(fixture.partner.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await page.getByLabel("Referensi PO/SO").fill("PO-E2E-1")

  await page.getByLabel("Produk baris 1").fill(fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("12,5")
  await page.getByRole("button", { name: "Simpan penerimaan" }).click()

  await expect(page).toHaveURL(/\/inventory\/penerimaan\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: /^Penerimaan PNR\// })).toBeVisible()

  await page.getByRole("button", { name: "Tandai siap" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer ditandai Siap." }),
  ).toBeVisible()

  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
  await expect(page.getByText("Selesai", { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Batalkan penerimaan" })).toHaveCount(0)

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(12.5)

  await page.goto(`/inventory/penerimaan?q=${encodeURIComponent(fixture.partner.name)}`)
  await expect(page.getByRole("row").filter({ hasText: fixture.partner.name })).toContainText(
    "Selesai",
  )
})
