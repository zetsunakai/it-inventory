import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, openEditableRow } from "../../shared/e2e/interactive"

// Pengiriman (backlog M2-04): stok gudang berikat tidak boleh minus, pesan per produk.

test.use({ storageState: ADMIN_STATE_FILE })

test("pengiriman melebihi stok ditolak per produk, lalu qty yang cukup divalidasi", async ({
  page,
}) => {
  const fixture = await createInventoryFixture("DLV")
  await receiveStock(fixture, "5")

  await page.goto("/inventory/pengiriman/baru")
  await fillInteractive(page.getByLabel("Customer", { exact: true }), fixture.partner.code)
  await page.getByRole("option", { name: new RegExp(fixture.partner.code) }).click()
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await openEditableRow(page)
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await expect(page.getByText("Tersedia 5 PCS")).toBeVisible()
  await page.getByLabel("Qty baris 1").fill("8")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page).toHaveURL(/\/inventory\/pengiriman\/[0-9a-f-]{36}$/)

  // Stok baru 5 dari 8: Konfirmasi menandai Sebagian tersedia, validasi menolak (R-06).
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Stok baru tersedia sebagian." }),
  ).toBeVisible()
  // Stok yang ada (5) sudah dipesan untuk pengiriman ini (R-07).
  await expect(
    page.getByRole("row").filter({ hasText: fixture.product.sku }).filter({ visible: true }),
  ).toContainText("5 PCS")
  await expect(page.getByRole("button", { name: "Lepas reservasi" })).toBeVisible()
  await page.getByRole("button", { name: "Validasi" }).click()
  // Pengiriman membaca qty selesai dari rincian pergerakan yang sudah terbentuk.
  await expect(page.getByRole("alertdialog")).toContainText("dari rincian lot")
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Perlu diselesaikan" })).toContainText(
    `Stok ${fixture.product.sku} di ${fixture.rack.code} tidak cukup: tersedia 5, dibutuhkan 8.`,
  )

  await page.getByRole("button", { name: "Kembali ke Draft" }).click()
  // Detail Draft dibuka dalam mode baca; Edit membuka form.
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await openEditableRow(page)
  // Halaman "buat" sebelumnya masih tersimpan tersembunyi oleh router; pakai yang terlihat.
  await page.getByLabel("Qty baris 1").filter({ visible: true }).fill("3")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Transfer disimpan." })).toBeVisible()
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Siap divalidasi." })).toBeVisible()
  await page.getByRole("button", { name: "Validasi" }).click()
  // Setelah demand diubah ke 3, qty selesai diisi dari dialog validasi.
  await page.getByRole("alertdialog").getByRole("button", { name: "Isi semua" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(2)
})
