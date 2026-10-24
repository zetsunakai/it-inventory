import { expect, test, type Page } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock } from "./fixtures"

test.use({ storageState: ADMIN_STATE_FILE })

async function expectSingleStatus(page: Page, buttonName: string) {
  const status = page.getByRole("region", { name: "Status", exact: true })
  await expect(status).toHaveCount(1)
  await expect(status.locator('[aria-current="step"]')).toHaveCount(1)
  const button = page.getByRole("button", { name: buttonName, exact: true })
  await expect(button).toBeVisible()
  await expect
    .poll(async () => {
      const statusBox = await status.boundingBox()
      const buttonBox = await button.boundingBox()
      if (!statusBox || !buttonBox) return Infinity
      return Math.abs(statusBox.y + statusBox.height / 2 - buttonBox.y - buttonBox.height / 2)
    })
    .toBeLessThanOrEqual(2)
  const style = await status.evaluate((element) => {
    const style = getComputedStyle(element)
    return { border: parseFloat(style.borderTopWidth), shadow: style.boxShadow }
  })
  expect(style.border).toBeGreaterThan(0)
  expect(style.shadow).not.toBe("none")
}

test("status hanya satu dan sejajar tombol; Aktivitas mengembalikan lebar form", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.addInitScript(() => localStorage.setItem("panel-samping-ciut", "false"))
  for (const path of ["/inventory/penerimaan/baru", "/dokumen-bc/bc23/baru"]) {
    await page.goto(path)
    await expectSingleStatus(page, "Simpan")
    const activity = page.getByRole("complementary", { name: "Aktivitas", exact: true })
    await expect
      .poll(() => activity.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(48)
    const card = page.locator(".form-sheet, .form-notebook").filter({ visible: true }).first()
    const fullWidth = (await card.boundingBox())!.width
    await page.getByRole("button", { name: "Tampilkan aktivitas", exact: true }).click()
    await expect
      .poll(() => activity.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(320)
    expect((await card.boundingBox())!.width).toBeLessThan(fullWidth - 200)
    await page.getByRole("button", { name: "Sembunyikan aktivitas", exact: true }).click()
    await expect
      .poll(() => activity.evaluate((element) => element.getBoundingClientRect().width))
      .toBe(48)
    await expect
      .poll(async () => Math.abs((await card.boundingBox())!.width - fullWidth))
      .toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole("region", { name: "Status", exact: true })).toHaveCount(1)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.getByRole("button", { name: "Tampilkan aktivitas", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Aktivitas", exact: true })).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Tutup", exact: true }).click()
})

test("penerimaan tanpa tab pergerakan mempertahankan satu status saat baca dan edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const fixture = await createInventoryFixture("STATUS")
  const id = await receiveStock(fixture, "7", undefined, false)
  await page.goto(`/inventory/penerimaan/${id}`)
  await expectSingleStatus(page, "Edit")
  await expect(page.getByRole("tab", { name: /Detail pergerakan/ })).toHaveCount(0)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expectSingleStatus(page, "Simpan")
  await page.getByRole("button", { name: "Buang", exact: true }).click()
  await expectSingleStatus(page, "Edit")
})
