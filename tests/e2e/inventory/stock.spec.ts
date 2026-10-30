import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"
import { createInventoryFixture, receiveStock, reserveDelivery } from "./fixtures"

// Tampilan stok, kartu stok, dan penelusuran lot (backlog M2-11, R-14).

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

test("stok dipesan dan tersedia; lot ditelusuri dari daftar lot", async ({ page }) => {
  const fixture = await createInventoryFixture("LOT")
  await receiveStock(fixture, "10", undefined, true, "LOT-UJI-1")
  // Pengiriman 4 yang sudah dikonfirmasi memesan stok.
  await reserveDelivery(fixture, "4")

  await page.goto(`/inventory/stok?q=${fixture.product.sku}`)
  await expect(page.getByRole("columnheader", { name: "Dipesan" })).toBeVisible()
  const row = page.getByRole("row").filter({ hasText: fixture.product.sku })
  await expect(row).toContainText("LOT-UJI-1")
  await expect(row.getByRole("cell").nth(-2)).toHaveText("4")
  await expect(row.getByRole("cell").nth(-1)).toHaveText("6")

  await page.goto("/inventory/lot?q=LOT-UJI-1")
  await page
    .getByRole("row")
    .filter({ hasText: fixture.product.sku })
    .getByRole("link")
    .first()
    .click()
  await expect(page.getByRole("heading", { name: "Lot LOT-UJI-1" })).toBeVisible()
  const balance = page.getByRole("row").filter({ hasText: fixture.rack.code }).first()
  await expect(balance).toContainText("10 PCS")
  await expect(balance).toContainText("6 PCS")
  await expect(page.getByRole("row").filter({ hasText: /PNR\// }).first()).toContainText("+10 PCS")
})
