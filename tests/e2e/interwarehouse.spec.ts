import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { expectActionBar } from "./action-bar"
import {
  expectDocumentStatus,
  fillInteractive,
  waitInteractive,
  openEditableRow,
} from "./interactive"

// Transfer antar gudang lewat lokasi transit (backlog R-10).
test.use({ storageState: ADMIN_STATE_FILE })

test("barang keluar ke transit lalu masuk ke gudang tujuan", async ({ page }, testInfo) => {
  const origin = await createInventoryFixture("IWA")
  const target = await createInventoryFixture("IWB")
  await receiveStock(origin, "10")

  await page.goto("/inventory/antar-gudang/baru")
  await waitInteractive(page.getByLabel("Produk baris 1"))
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(origin.rack.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(target.rack.code) }).click()
  await openEditableRow(page, "interwarehouse-lines")
  await fillInteractive(page.getByLabel("Produk baris 1"), origin.product.sku)
  await page.getByRole("option", { name: new RegExp(origin.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("6")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("heading", { name: /^Transfer antar gudang ITW\// })).toBeVisible()

  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectActionBar(page, ["Edit", "Buat", "Konfirmasi", "Batalkan permintaan"])
    await page.screenshot({
      path: testInfo.outputPath(`interwarehouse-view-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await expectActionBar(page, ["Simpan", "Buang"])
    await page.screenshot({
      path: testInfo.outputPath(`interwarehouse-edit-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Buang", exact: true }).click()
  }
  await page.setViewportSize({ width: 1366, height: 900 })

  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Permintaan dikonfirmasi." }),
  ).toBeVisible()
  const requestUrl = page.url()
  await expectActionBar(page, ["Batalkan permintaan"])
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)

  // Setelah konfirmasi tab Barang tetap aktif; tautan transfer ada di tab Transfer.
  await page.getByRole("tab", { name: "Transfer", exact: true }).click()

  // Transfer keluar: gudang asal → transit.
  await page.getByRole("row").filter({ hasText: "keluar" }).getByRole("link").click()
  await expect(
    page.getByRole("heading", { name: /^Transfer antar gudang keluar TRF\// }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Validasi" }).click()
  // Qty selesai mulai kosong (I-01): isi semua qty diminta.
  await page.getByRole("alertdialog").getByRole("button", { name: "Isi semua" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
  expect(await stockAt(origin.product.id, origin.rack.id)).toBe(4)

  await page.goto(requestUrl)
  await expectDocumentStatus(page, "Di perjalanan")
  // Tab Barang (I-05) terbuka lebih dulu dengan qty per produk; transfernya di tab Transfer.
  await expect(page.getByRole("tab", { name: "Barang", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.getByRole("tab", { name: "Masih di perjalanan" })).toBeVisible()
  await page.getByRole("tab", { name: "Transfer" }).click()

  // Transfer masuk: transit → gudang tujuan.
  await page.getByRole("row").filter({ hasText: "masuk" }).getByRole("link").click()
  await page.getByRole("button", { name: "Validasi" }).click()
  // Qty selesai mulai kosong (I-01): isi semua qty diminta.
  await page.getByRole("alertdialog").getByRole("button", { name: "Isi semua" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
  expect(await stockAt(origin.product.id, target.rack.id)).toBe(6)

  await page.goto(requestUrl)
  await expectDocumentStatus(page, "Selesai")
})
