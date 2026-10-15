import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Penyesuaian (backlog M2-08): alasan wajib, stok berubah setelah disetujui.

test.use({ storageState: ADMIN_STATE_FILE })

test("penyesuaian kurangi stok tercatat setelah disetujui", async ({ page }) => {
  const fixture = await createInventoryFixture("ADJ")
  await receiveStock(fixture, "10")

  await page.goto("/inventory/penyesuaian/baru")
  await waitInteractive(page.getByLabel("Produk baris 1"))
  await page.getByLabel("Arah").click()
  await page.getByRole("option", { name: /^Kurangi stok/ }).click()
  await page.getByLabel("Lokasi gudang").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("2")

  // Tanpa alasan ditolak.
  await page.getByRole("button", { name: "Simpan penyesuaian" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Alasan wajib diisi." })).toBeVisible()

  await page.getByLabel("Alasan").fill("Kemasan rusak saat penyimpanan")
  await page.getByRole("button", { name: "Simpan penyesuaian" }).click()
  await expect(page.getByRole("heading", { name: /^Penyesuaian ADJ\// })).toBeVisible()

  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await page.getByRole("button", { name: "Setujui dan validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Setujui dan validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Disetujui dan divalidasi." }),
  ).toBeVisible()
  await expect(page.getByText(/oleh Administrator$/)).toBeVisible()

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(8)
})
