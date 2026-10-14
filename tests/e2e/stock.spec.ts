import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock } from "./fixtures"

// Tampilan stok dan kartu stok (backlog M2-11).

test.use({ storageState: ADMIN_STATE_FILE })

test("saldo per lokasi dan kartu stok produk", async ({ page }) => {
  const fixture = await createInventoryFixture("STK")
  await receiveStock(fixture, "7")

  await page.goto(`/inventory/stok?q=${fixture.product.sku}`)
  const row = page.getByRole("row").filter({ hasText: fixture.product.sku })
  await expect(row).toContainText(fixture.rack.code)
  await expect(row).toContainText("7 PCS")

  await row.getByRole("link").first().click()
  await expect(
    page.getByRole("heading", { name: `Kartu stok ${fixture.product.sku}` }),
  ).toBeVisible()
  await expect(page.getByText("Saldo akhir").locator("..")).toContainText("7 PCS")
  await expect(page.getByRole("row").filter({ hasText: /^.*PNR\// })).toContainText("7")
})
