import { expect, test, type Locator } from "@playwright/test"
import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock } from "./fixtures"

test.use({ storageState: ADMIN_STATE_FILE })

async function headers(table: Locator) {
  return (await table.getByRole("columnheader").allTextContents()).map((text) =>
    text.replace(/\s+/g, " ").trim(),
  )
}

test("tabel Barang memiliki kolom yang sama pada mode baca dan edit", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const fixture = await createInventoryFixture("MIRROR")
  const id = await receiveStock(fixture, "7", undefined, false)
  await page.goto(`/inventory/penerimaan/${id}`)
  const table = page.locator('[data-relational-table="transfer-lines"]')
  await expect(table).toBeVisible()
  await table.locator("tbody > tr").first().locator("td").nth(1).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveCount(0)
  const before = await headers(table)
  expect(before).toEqual(["", "Seri", "Produk *", "Qty *", "Satuan *", "Nomor lot", "Aksi"])
  const widths = await table
    .getByRole("columnheader")
    .evaluateAll((cells) => cells.slice(2, 6).map((cell) => cell.getBoundingClientRect().width))
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeHidden()
  await expect(table.getByRole("button", { name: /^(Edit|Selesai) baris/ })).toHaveCount(0)
  await table.locator("tbody > tr").first().locator("td").nth(1).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveValue("7")
  expect(await headers(table)).toEqual(before)
  await expect(table.getByRole("button", { name: "Atur kolom Barang", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Buang", exact: true }).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveCount(0)
  expect(await headers(table)).toEqual(before)
})

test("editable bottom membagi kolom rata tanpa overflow dan pin, termasuk preferensi lama", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "relasi:transfer-lines",
      JSON.stringify({
        widths: { product: 900, qty: 500 },
        hidden: ["lot"],
        pinned: "product",
        order: ["qty", "product", "lot", "uom"],
      }),
    )
  })
  await page.goto("/inventory/pengiriman/baru")
  const table = page.locator('[data-relational-table="transfer-lines"]').filter({ visible: true })
  await expect
    .poll(() => headers(table))
    .toEqual(["", "Seri", "Produk *", "Qty *", "Satuan *", "Nomor lot", "Aksi"])
  const row = table.locator("tbody > tr").first()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeHidden()
  await expect(table.getByRole("button", { name: /^(Edit|Selesai) baris/ })).toHaveCount(0)
  await table.getByRole("button", { name: "Pin baris 1", exact: true }).click()
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeHidden()
  await table.getByRole("button", { name: "Pin baris 1", exact: true }).click()
  await row.locator("td").nth(1).click()
  await expect(table.getByLabel("Produk baris 1", { exact: true })).toBeFocused()
  await page.getByRole("heading").first().click()
  await row.locator('[data-relation-column="qty"]').click({ position: { x: 2, y: 2 } })
  await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeFocused()
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeVisible()
    await expect(table.getByRole("button", { name: /^Pin kolom/ })).toHaveCount(0)
    await expect(table.getByRole("separator")).toHaveCount(0)
    await expect(table.locator('thead button:not([role="checkbox"])')).toHaveCount(0)
    await expect(
      table.locator('thead input:not([type="checkbox"]):not([type="hidden"])'),
    ).toHaveCount(0)
    await expect(table.locator("[aria-sort]")).toHaveCount(0)
    const checkLayout = async () => {
      const layout = await table.evaluate((root) => {
        const container = root.querySelector('[data-slot="table-container"]')!
        const cells = Array.from(root.querySelectorAll("thead th"))
        const dataWidths = cells.slice(2, -1).map((cell) => cell.getBoundingClientRect().width)
        return {
          overflow: container.scrollWidth - container.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          difference: Math.max(...dataWidths) - Math.min(...dataWidths),
          pinned: Array.from(root.querySelectorAll("th, td")).some((cell) => {
            const style = getComputedStyle(cell)
            return style.position === "sticky" && (style.left !== "auto" || style.right !== "auto")
          }),
          widths: dataWidths,
        }
      })
      expect(layout.overflow).toBeLessThanOrEqual(1)
      expect(layout.pageOverflow).toBeLessThanOrEqual(1)
      expect(layout.difference).toBeLessThanOrEqual(1)
      expect(layout.pinned).toBe(false)
      return layout.widths
    }
    const editing = await checkLayout()
    await page.getByRole("heading").first().click()
    await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeHidden()
    expect(await checkLayout()).toEqual(editing)
    await row.locator("td").nth(1).click()
    await table.getByLabel("Qty baris 1", { exact: true }).fill("12345")
    await row.locator("td").nth(1).click()
    await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeVisible()
    await page.getByRole("heading").first().click()
    await expect(table.getByLabel("Qty baris 1", { exact: true })).toBeHidden()
    await expect(row).toContainText("12345")
    await row.locator("td").nth(1).click()
    await expect(table.getByLabel("Qty baris 1", { exact: true })).toHaveValue("12345")
    expect(await checkLayout()).toEqual(editing)
    await page.screenshot({ path: testInfo.outputPath(`pengiriman-${width}.png`), fullPage: true })
  }
})
