import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"

test.use({ storageState: ADMIN_STATE_FILE })

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
