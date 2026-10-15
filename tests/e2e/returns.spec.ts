import { expect, test, type Page } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive } from "./interactive"

// Retur sebagai dokumen permintaan (backlog R-11): dibuat dari penerimaan Selesai, qty tidak
// melebihi sisa, retur dengan pengganti membuat penerimaan pengganti setelah retur Selesai.

test.use({ storageState: ADMIN_STATE_FILE })

async function validate(page: Page) {
  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
}

test("retur ke vendor dengan pengganti", async ({ page }) => {
  const fixture = await createInventoryFixture("RTR")
  const receiptId = await receiveStock(fixture, "10")
  const sku = fixture.product.sku

  await page.goto(`/inventory/penerimaan/${receiptId}`)
  await page.getByRole("button", { name: "Buat retur" }).click()
  await expect(page).toHaveURL(/\/inventory\/retur\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: /^Retur PRT\// })).toBeVisible()
  const requestUrl = page.url()

  const qty = page.getByLabel(`Qty retur ${sku}`)
  await fillInteractive(qty, "11")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "melebihi sisa" })).toContainText(
    `Qty retur ${sku} melebihi sisa yang bisa diretur: 10.`,
  )

  await qty.fill("4")
  await page.getByLabel(`Tindakan ${sku}`).click()
  await page.getByRole("option", { name: "Retur dengan pengganti" }).click()
  await page.getByLabel("Alasan retur").fill("Barang cacat")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Permintaan retur disimpan." }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Permintaan retur dikonfirmasi." }),
  ).toBeVisible()

  // Transfer retur ke vendor sudah dikonfirmasi dan memesan stok.
  await page.getByRole("link", { name: /^RTR\// }).click()
  await expect(page.getByRole("heading", { name: /^Retur ke vendor RTR\// })).toBeVisible()
  await validate(page)
  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(6)

  // Setelah retur Selesai, penerimaan pengganti dibuat sebesar qty yang diretur.
  await page.goto(requestUrl)
  await expect(page.getByText("Diproses", { exact: true }).first()).toBeVisible()
  await page.getByRole("row").filter({ hasText: "Pengganti" }).getByRole("link").click()
  await expect(page.getByRole("heading", { name: /^Penerimaan PNR\// })).toBeVisible()
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await validate(page)
  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(10)

  await page.goto(requestUrl)
  await expect(page.getByText("Selesai", { exact: true }).first()).toBeVisible()
  await page.goto(`/inventory/penerimaan/${receiptId}`)
  await expect(page.getByRole("link", { name: /^PRT\// })).toBeVisible()
})

test("batalkan permintaan retur lewat dialog konfirmasi", async ({ page }) => {
  const fixture = await createInventoryFixture("RTB")
  const receiptId = await receiveStock(fixture, "3")

  await page.goto(`/inventory/penerimaan/${receiptId}`)
  await page.getByRole("button", { name: "Buat retur" }).click()
  await expect(page.getByRole("heading", { name: /^Retur PRT\// })).toBeVisible()
  await page.getByRole("button", { name: "Batalkan permintaan" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Batalkan permintaan" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Permintaan retur dibatalkan." }),
  ).toBeVisible()
  await expect(page.getByText("Batal", { exact: true }).first()).toBeVisible()
})
