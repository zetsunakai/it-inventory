import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Transfer internal (backlog M2-06): saldo pindah tanpa mengubah total stok.

test.use({ storageState: ADMIN_STATE_FILE })

test("transfer internal memindah saldo antar lokasi", async ({ page }) => {
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
  await page.getByRole("button", { name: "Simpan transfer internal" }).click()
  await expect(page.getByRole("heading", { name: /^Transfer internal TRF\// })).toBeVisible()

  await page.getByRole("button", { name: "Tandai siap" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer ditandai Siap." }),
  ).toBeVisible()
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
