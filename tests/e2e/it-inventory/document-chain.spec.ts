import { eq } from "drizzle-orm"
import { expect, test } from "@playwright/test"

import { createDb } from "@/server/db/client"
import { customsDocuments } from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../../shared/test-env"
import { ADMIN_STATE_FILE, ACCOUNTS } from "../../shared/e2e/accounts"
import { login } from "../../shared/e2e/login"

test("auditor melihat satu daftar dokumen tanpa rantai dan tombol Buat", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL("/")
  await page.goto("/dokumen-bc/flow")
  await expect(page).toHaveURL(/\/dokumen-bc$/)
  await expect(page.getByRole("heading", { name: "Daftar dokumen" })).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Jenis dokumen" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Buat", exact: true })).toHaveCount(0)
  const sidebar = page.locator('[data-slot="sidebar-inner"]')
  await expect(sidebar.getByRole("link", { name: "Daftar dokumen" })).toBeVisible()
  await expect(sidebar.getByText("Rantai dokumen", { exact: true })).toHaveCount(0)
  await expect(sidebar.getByText("Dokumen impor", { exact: true })).toHaveCount(0)
  await expect(sidebar.getByText("Dokumen ekspor", { exact: true })).toHaveCount(0)
  await expect(sidebar.getByText("Dokumen TPB", { exact: true })).toHaveCount(0)
})

test.describe("daftar terpadu sebagai Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("dialog membatasi jenis menurut entitas dan mereset pilihan lama di desktop/HP", async ({
    page,
  }, testInfo) => {
    for (const width of [1366, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/dokumen-bc")
      await expect(page.getByRole("columnheader", { name: "Jenis dokumen" })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`daftar-${width}.png`), fullPage: true })
      await page.getByRole("button", { name: "Buat", exact: true }).click()
      const dialog = page.getByRole("dialog", { name: "Dokumen baru" })
      await expect(dialog.getByLabel("Jenis dokumen", { exact: true })).toBeDisabled()
      await expect(dialog.getByRole("button", { name: "Lanjut" })).toBeDisabled()
      await dialog.getByLabel("Entitas", { exact: true }).click()
      await page.getByRole("option", { name: "Importir", exact: true }).click()
      await dialog.getByLabel("Jenis dokumen", { exact: true }).click()
      await expect(page.getByRole("option")).toHaveCount(1)
      await page.getByRole("option", { name: "BC 2.0", exact: true }).click()
      await expect(dialog.getByRole("button", { name: "Lanjut" })).toBeEnabled()
      await dialog.getByLabel("Entitas", { exact: true }).click()
      await page.getByRole("option", { name: "PLB", exact: true }).click()
      await expect(dialog.getByRole("button", { name: "Lanjut" })).toBeDisabled()
      await dialog.getByLabel("Jenis dokumen", { exact: true }).click()
      await expect(page.getByRole("option")).toHaveCount(7)
      await expect(page.getByRole("option", { name: "BC 2.0", exact: true })).toHaveCount(0)
      await page.getByRole("option", { name: "BC 4.0", exact: true }).click()
      await expect(page.getByRole("option")).toHaveCount(0)
      await expect(dialog.locator('#customs-kind [data-slot="select-value"]')).toHaveText("BC 4.0")
      await page.screenshot({ path: testInfo.outputPath(`dialog-${width}.png`), fullPage: true })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await dialog.getByRole("button", { name: "Lanjut" }).click()
      await expect(page).toHaveURL(/\/dokumen-bc\/bc40\/baru$/)
      await expect(page.getByRole("tab", { name: "Header", exact: true })).toBeVisible()
    }
  })

  test("Duplikat membuka detail sesuai jenis tanpa mengirim fungsi ke klien", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const { db, pool } = createDb(TEST_DATABASE_URL)
    const [record] = await db.insert(customsDocuments).values({ docCode: "20" }).returning()
    try {
      await page.goto(`/dokumen-bc?q=${encodeURIComponent(record.number)}`)
      await expect(page.getByRole("link", { name: record.number, exact: true })).toBeVisible()
      await page.getByRole("checkbox", { name: `Pilih ${record.number}`, exact: true }).click()
      await page.getByRole("button", { name: "Duplikat", exact: true }).click()
      await expect(page).toHaveURL(/\/dokumen-bc\/bc20\/[0-9a-f-]+$/)
      expect(page.url()).not.toContain(record.id)
      await expect(page.getByRole("tab", { name: "Header", exact: true })).toBeVisible()
      const copyId = page.url().split("/").at(-1)!
      await db.delete(customsDocuments).where(eq(customsDocuments.id, copyId))
      expect(errors).toEqual([])
    } finally {
      await db.delete(customsDocuments).where(eq(customsDocuments.id, record.id))
      await pool.end()
    }
  })
})
