import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"

test.use({ storageState: ADMIN_STATE_FILE })

test("header daftar memisahkan import/export dari Buat dan pencarian", async ({
  page,
}, testInfo) => {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/master/produk")
    const title = page.getByRole("heading", { name: "Produk", exact: true })
    const exportButton = page.getByRole("button", { name: "Export", exact: true })
    const importLink = page.getByRole("link", { name: "Import", exact: true })
    const create = page.getByRole("link", { name: "Buat", exact: true })
    const search = page.getByRole("searchbox", { name: "Cari product code, nama, atau kode HS" })
    await expect(search).toBeVisible()
    for (const control of [exportButton, importLink, create]) await expect(control).toBeInViewport()
    const titleBox = (await title.boundingBox())!
    const exportBox = (await exportButton.boundingBox())!
    const createBox = (await create.boundingBox())!
    const searchBox = (await search.boundingBox())!
    expect(exportBox.y + exportBox.height).toBeLessThanOrEqual(createBox.y)
    if (width === 1366) {
      expect(exportBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
      expect(createBox.x + createBox.width).toBeLessThanOrEqual(searchBox.x)
      expect(
        Math.abs(searchBox.y + searchBox.height / 2 - createBox.y - createBox.height / 2),
      ).toBeLessThanOrEqual(2)
    } else {
      expect(exportBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
      expect(searchBox.y).toBeGreaterThanOrEqual(createBox.y + createBox.height)
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`list-actions-${width}.png`),
      fullPage: true,
    })
  }
})

test("filter aktif tetap dapat digunakan tanpa halaman melebar di mobile dan desktop", async ({
  page,
}, testInfo) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/master/produk?kategori=raw_material&dokumen-bc=belum&status=aktif")
    const search = page.getByRole("searchbox", { name: "Cari product code, nama, atau kode HS" })
    await expect(search).toBeVisible()
    const remove = page.getByRole("button", { name: "Hapus Kategori: Bahan baku", exact: true })
    await expect(remove).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Filter, kelompokkan, dan favorit" }),
    ).toBeInViewport()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`filters-${width}.png`), fullPage: true })

    await remove.click()
    await expect(page).not.toHaveURL(/kategori=/)
    await expect(page).toHaveURL(/dokumen-bc=belum/)
    await expect(page).toHaveURL(/status=aktif/)
    await expect(search).toBeVisible()
  }
})
