import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Pemakaian & scrap (backlog R-12): jenis pemakaian dipilih, alasan wajib, stok berkurang setelah
// disetujui.

test.use({ storageState: ADMIN_STATE_FILE })

test("pemakaian tercatat dengan jenisnya setelah disetujui", async ({ page }) => {
  const fixture = await createInventoryFixture("PKI")
  await receiveStock(fixture, "10")

  await page.goto("/inventory/scrap/baru")
  await expect(page.getByRole("heading", { name: "Buat pemakaian" })).toBeVisible()
  await waitInteractive(page.getByLabel("Produk baris 1"))
  await page.getByLabel("Jenis pemakaian").click()
  await page.getByRole("option", { name: "Pemakaian", exact: true }).click()
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("3")
  await page.getByLabel("Alasan").fill("Dipakai untuk perawatan mesin")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("heading", { name: /^Pemakaian SCR\// })).toBeVisible()

  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await page.getByRole("button", { name: "Setujui dan validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Setujui dan validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Disetujui dan divalidasi." }),
  ).toBeVisible()
  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(7)

  await page.goto("/inventory/scrap?jenis=usage")
  await expect(page.getByRole("heading", { name: "Pemakaian & scrap" })).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: "Pemakaian" }).first()).toBeVisible()
})
