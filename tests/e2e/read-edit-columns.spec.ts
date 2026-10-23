import { expect, test, type Locator } from "@playwright/test"
import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock } from "./fixtures"

test.use({ storageState: ADMIN_STATE_FILE })

async function headers(table: Locator) {
  return (await table.getByRole("columnheader").allTextContents()).map((text) =>
    text.replace(/\s+/g, " ").trim(),
  )
}

test("tabel Barang memiliki kolom dan preferensi yang sama pada mode baca dan edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const fixture = await createInventoryFixture("MIRROR")
  const id = await receiveStock(fixture, "7", undefined, false)
  await page.goto(`/inventory/penerimaan/${id}`)
  const table = page.locator('[data-relational-table="transfer-lines"]')
  await expect(table).toBeVisible()
  const before = await headers(table)
  expect(before).toEqual(["", "Seri", "Produk *", "Qty *", "Satuan *", "Nomor lot", "Aksi"])
  const widths = await table
    .getByRole("columnheader")
    .evaluateAll((cells) => cells.slice(2, 6).map((cell) => cell.getBoundingClientRect().width))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveValue("7")
  expect(await headers(table)).toEqual(before)
  await table.getByRole("button", { name: "Atur kolom Barang", exact: true }).click()
  await page.getByRole("menuitemcheckbox", { name: "Nomor lot", exact: true }).click()
  await page.keyboard.press("Escape")
  const edited = await headers(table)
  await page.getByRole("button", { name: "Buang", exact: true }).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveCount(0)
  expect(await headers(table)).toEqual(edited)
})
