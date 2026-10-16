import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Transfer antar gudang lewat lokasi transit (backlog R-10).
test.use({ storageState: ADMIN_STATE_FILE })

test("barang keluar ke transit lalu masuk ke gudang tujuan", async ({ page }) => {
  const origin = await createInventoryFixture("IWA")
  const target = await createInventoryFixture("IWB")
  await receiveStock(origin, "10")

  await page.goto("/inventory/antar-gudang/baru")
  await waitInteractive(page.getByLabel("Produk baris 1"))
  await page.getByLabel("Lokasi asal").click()
  await page.getByRole("option", { name: new RegExp(origin.rack.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(target.rack.code) }).click()
  await fillInteractive(page.getByLabel("Produk baris 1"), origin.product.sku)
  await page.getByRole("option", { name: new RegExp(origin.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill("6")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("heading", { name: /^Transfer antar gudang ITW\// })).toBeVisible()

  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Permintaan dikonfirmasi." }),
  ).toBeVisible()
  const requestUrl = page.url()

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
  await expect(page.getByText("Di perjalanan", { exact: true }).first()).toBeVisible()
  // Tab dokumen (RU-23): barang di transit terbuka lebih dulu, transfernya di tab Transfer.
  await expect(page.getByRole("tab", { name: "Masih di perjalanan" })).toHaveAttribute(
    "aria-selected",
    "true",
  )
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
  await expect(page.getByText("Selesai", { exact: true }).first()).toBeVisible()
})
