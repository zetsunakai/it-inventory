import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"

// Pengiriman (backlog M2-04): stok gudang berikat tidak boleh minus, pesan per produk.

test.use({ storageState: ADMIN_STATE_FILE })

test("pengiriman melebihi stok ditolak per produk, lalu qty yang cukup divalidasi", async ({
  page,
}) => {
  const fixture = await createInventoryFixture("DLV")
  await receiveStock(fixture, "5")

  await page.goto("/inventory/pengiriman/baru")
  await page.getByLabel("Customer").fill(fixture.partner.code)
  await page.getByRole("option", { name: new RegExp(fixture.partner.code) }).click()
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await page.getByLabel("Produk baris 1").fill(fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await expect(page.getByText("Tersedia 5 PCS")).toBeVisible()
  await page.getByLabel("Qty baris 1").fill("8")
  await page.getByRole("button", { name: "Simpan pengiriman" }).click()
  await expect(page).toHaveURL(/\/inventory\/pengiriman\/[0-9a-f-]{36}$/)

  await page.getByRole("button", { name: "Tandai siap" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Perlu diselesaikan" })).toContainText(
    `Stok ${fixture.product.sku} di ${fixture.rack.code} tidak cukup: tersedia 5, dibutuhkan 8.`,
  )

  // Halaman "buat" sebelumnya masih tersimpan tersembunyi oleh router; pakai yang terlihat.
  await page.getByLabel("Qty baris 1").filter({ visible: true }).fill("3")
  await page.getByRole("button", { name: "Simpan perubahan" }).click()
  await expect(page.getByText("Perubahan disimpan.")).toBeVisible()
  await page.getByRole("button", { name: "Tandai siap" }).click()
  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(2)
})
