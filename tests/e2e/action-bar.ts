import { expect, type Page } from "@playwright/test"

// Satu pemilik baris aksi, urutan DOM/keyboard sama dengan urutan visual, dan status tidak ganda.
export async function expectActionBar(page: Page, labels: string[]) {
  const bar = page.locator(".form-actions").filter({ visible: true })
  await expect(bar).toHaveCount(1)
  const controls = bar.locator("button, a").filter({ visible: true })
  await expect(controls).toHaveText(labels)
  await expect(page.getByRole("region", { name: "Status", exact: true })).toHaveCount(1)
  for (let index = 0; index < labels.length; index++) {
    await expect(controls.nth(index)).toBeInViewport()
    if (index > 0) {
      const previous = (await controls.nth(index - 1).boundingBox())!
      const current = (await controls.nth(index).boundingBox())!
      if (Math.abs(current.y - previous.y) <= 2) {
        expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width)
      } else {
        expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height)
      }
    }
  }
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
}
