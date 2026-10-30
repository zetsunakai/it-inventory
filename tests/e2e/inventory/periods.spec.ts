import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"
import { createInventoryFixture, receiveStock } from "./fixtures"

// Tutup periode (backlog M2-10). Memakai Maret 2020 supaya tidak mengganggu tes lain.

test.use({ storageState: ADMIN_STATE_FILE })

test("periode lama ditutup dari halaman Tutup periode", async ({ page }) => {
  const fixture = await createInventoryFixture("PRD")
  await receiveStock(fixture, "5", "2020-03-10T10:00:00+07:00")

  await page.goto("/inventory/periode")
  const row = page.getByRole("row").filter({ hasText: "Maret 2020" })
  await expect(row).toContainText("Belum ditutup")
  await row.getByRole("button", { name: "Tutup periode" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Tutup periode" }).click()
  await expect(row).toContainText("Ditutup")
  await expect(row.getByRole("button", { name: "Tutup periode" })).toHaveCount(0)
  // Bulan berjalan belum bisa ditutup.
  await expect(page.getByRole("row").filter({ hasText: "Berjalan" })).toHaveCount(1)
})
