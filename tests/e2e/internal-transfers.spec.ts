import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Pindah lokasi (backlog M2-06, R-09): saldo pindah di dalam satu gudang, divalidasi langsung dari
// Draft.

test.use({ storageState: ADMIN_STATE_FILE })

test("pindah lokasi memindah saldo di dalam gudang tanpa konfirmasi terpisah", async ({ page }) => {
  const fixture = await createInventoryFixture("TRF")
  await receiveStock(fixture, "10")

  await page.goto("/inventory/transfer/baru")
  await waitInteractive(page.getByLabel("Produk baris 1"))
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack2.code) }).click()
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("4")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("heading", { name: /^Pindah lokasi TRF\// })).toBeVisible()

  await expect(page.getByRole("button", { name: "Konfirmasi" })).toHaveCount(0)
  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()

  const [from, to] = await Promise.all([
    stockAt(fixture.product.id, fixture.rack.id),
    stockAt(fixture.product.id, fixture.rack2.id),
  ])
  expect([from, to, from + to]).toEqual([6, 4, 10])
})
