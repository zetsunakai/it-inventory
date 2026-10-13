import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive } from "./interactive"

// Retur (backlog M2-07): dibuat dari penerimaan Selesai, qty tidak melebihi sisa.

test.use({ storageState: ADMIN_STATE_FILE })

test("retur sebagian penerimaan ke vendor mengurangi stok", async ({ page }) => {
  const fixture = await createInventoryFixture("RTR")
  const receiptId = await receiveStock(fixture, "10")

  await page.goto(`/inventory/penerimaan/${receiptId}`)
  await page.getByRole("button", { name: "Buat retur" }).click()
  await expect(page).toHaveURL(/\/inventory\/retur\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: /^Retur RTR\// })).toBeVisible()

  const qty = page.getByLabel(`Qty retur ${fixture.product.sku}`)
  await fillInteractive(qty, "11")
  await page.getByRole("button", { name: "Simpan qty retur" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "melebihi sisa" })).toContainText(
    `Qty retur ${fixture.product.sku} melebihi sisa yang bisa diretur: 10.`,
  )

  await qty.fill("4")
  await page.getByRole("button", { name: "Simpan qty retur" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Qty retur disimpan." })).toBeVisible()
  await page.getByRole("button", { name: "Tandai siap" }).click()
  await page.getByRole("button", { name: "Validasi" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(6)
  await page.goto(`/inventory/penerimaan/${receiptId}`)
  await expect(page.getByRole("link", { name: /^RTR\// })).toBeVisible()
})
