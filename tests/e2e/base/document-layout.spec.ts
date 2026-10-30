import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { createDb } from "@/server/db/client"
import { customsDocumentTransfers, products } from "@/server/db/schema"
import {
  insertCompleteDocument,
  insertSourceTransfer,
} from "../../db/it-inventory/customs-fixtures"
import { TEST_DATABASE_URL } from "../../shared/test-env"

import { ACCOUNTS, ADMIN_STATE_FILE } from "../../shared/e2e/accounts"
import { createInventoryFixture, receiveStock } from "../inventory/fixtures"
import { expectActionBar } from "../../shared/e2e/action-bar"
import { login } from "../../shared/e2e/login"

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

test("BC hanya bisa Submit dari mode baca; Submitted tidak menawarkan aksi lagi", async ({
  page,
}, testInfo) => {
  const fixture = await createInventoryFixture("BCACTION")
  const { db, pool } = createDb(TEST_DATABASE_URL)
  let documentId: string
  try {
    await db.update(products).set({ hsCode: "52081100" }).where(eq(products.id, fixture.product.id))
    documentId = await db.transaction(async (tx) => {
      const doc = await insertCompleteDocument(tx, "23", fixture.product.id)
      const transferId = await insertSourceTransfer(tx, "23", fixture.product.id)
      await tx.insert(customsDocumentTransfers).values({ documentId: doc.id, transferId })
      return doc.id
    })
  } finally {
    await pool.end()
  }
  await page.goto(`/dokumen-bc/bc23/${documentId}`)
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectActionBar(page, ["Edit", "Buat", "Submit"])
    await page.screenshot({
      path: testInfo.outputPath(`customs-view-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await expectActionBar(page, ["Simpan", "Buang"])
    await expect(page.getByRole("button", { name: "Submit", exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath(`customs-edit-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Buang", exact: true }).click()
  }
  await page.getByRole("button", { name: "Submit", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByRole("button", { name: "Kembali", exact: true })).toBeFocused()
  await dialog.getByRole("button", { name: "Submit", exact: true }).click()
  await expect(
    page.getByRole("region", { name: "Status", exact: true }).locator('[aria-current="step"]'),
  ).toHaveText("Submitted")
  await expect(page.getByRole("button", { name: /^(Edit|Submit)$/ })).toHaveCount(0)
  await expect(page.locator(".form-actions").filter({ visible: true })).toHaveCount(0)
})

test("Auditor melihat status transfer tanpa tombol mutasi", async ({ browser }) => {
  const fixture = await createInventoryFixture("READACTION")
  const id = await receiveStock(fixture, "7", undefined, false)
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const page = await context.newPage()
    await page.goto(`/inventory/penerimaan/${id}`)
    await login(page, ACCOUNTS.auditor)
    await expect(page.getByRole("button", { name: "Menu akun Demo Auditor" })).toBeVisible()
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/inventory/penerimaan/${id}`)
      await expect(page.getByRole("region", { name: "Status", exact: true })).toHaveCount(1)
      await expect(
        page.getByRole("button", { name: /^(Edit|Konfirmasi|Batalkan penerimaan)$/ }),
      ).toHaveCount(0)
      await expect(page.locator(".form-actions").filter({ visible: true })).toHaveCount(0)
    }
  } finally {
    await context.close()
  }
})

test("penerimaan tanpa tab pergerakan mempertahankan satu status saat baca dan edit", async ({
  page,
}, testInfo) => {
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

  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectActionBar(page, ["Edit", "Buat", "Konfirmasi", "Batalkan penerimaan"])
    const actionBox = (await page.locator(".form-actions").filter({ visible: true }).boundingBox())!
    const panelBox = (await page
      .getByRole("heading", { name: "Dokumen BC", exact: true })
      .boundingBox())!
    expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(panelBox.y)
    await page.screenshot({
      path: testInfo.outputPath(`receipt-view-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Edit", exact: true }).click()
    await expectActionBar(page, ["Simpan", "Buang"])
    await page.screenshot({
      path: testInfo.outputPath(`receipt-edit-${width}.png`),
      fullPage: true,
    })
    await page.getByRole("button", { name: "Buang", exact: true }).click()
  }
  await page.getByRole("button", { name: "Konfirmasi", exact: true }).click()
  await expect(page.getByRole("button", { name: "Validasi", exact: true })).toBeVisible()
  await expect(page.locator(".form-actions").filter({ visible: true })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)
})
