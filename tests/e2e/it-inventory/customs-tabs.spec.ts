import { eq } from "drizzle-orm"
import { expect, test } from "@playwright/test"

import { createDb } from "@/server/db/client"
import { customsDocuments } from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../../shared/test-env"
import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"

test.use({ storageState: ADMIN_STATE_FILE })

test("tab BC rata dan pilihan aktif terlihat di mode baca maupun edit", async ({ page }) => {
  const { db, pool } = createDb(TEST_DATABASE_URL)
  const [record] = await db
    .insert(customsDocuments)
    .values({ docCode: "20" })
    .returning({ id: customsDocuments.id })
  try {
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of [`/dokumen-bc/bc20/${record.id}`, "/dokumen-bc/bc20/baru"]) {
        await page.goto(path)
        const list = page.getByRole("tablist")
        const tabs = list.getByRole("tab")
        await expect(tabs.first()).toBeVisible()
        const widths = await tabs.evaluateAll((tabs) =>
          tabs.map((tab) => tab.getBoundingClientRect().width),
        )
        expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
        const tops = await tabs.evaluateAll((tabs) =>
          tabs.map((tab) => tab.getBoundingClientRect().top),
        )
        if (width >= 1024) expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
        const labels = await tabs.evaluateAll((tabs) =>
          tabs.map((tab) => ({
            length: [...(tab.textContent ?? "").trim()].length,
            whiteSpace: getComputedStyle(tab).whiteSpace,
            fits: tab.scrollWidth <= tab.clientWidth + 1,
          })),
        )
        for (const label of labels) {
          expect(label.whiteSpace).toBe("normal")
          expect(label.fits).toBe(true)
        }
        await expect(list.getByRole("tab", { selected: true })).toHaveCount(1)
        const header = list.getByRole("tab", { name: "Header", exact: true })
        const entities = list.getByRole("tab", { name: "Entitas", exact: true })
        await expect(header).toHaveAttribute("data-active", "")
        await entities.click()
        await expect(entities).toHaveAttribute("aria-selected", "true")
        await expect(entities).toHaveAttribute("data-active", "")
        await expect(header).not.toHaveAttribute("data-active")
        const colors = await entities.evaluate((tab) => {
          const style = getComputedStyle(tab)
          return {
            weight: style.fontWeight,
            background: style.backgroundColor,
            border: style.borderBottomColor,
          }
        })
        expect(colors.weight).toBe("600")
        expect(colors.background).not.toBe("rgba(0, 0, 0, 0)")
        expect(colors.border).not.toBe("rgba(0, 0, 0, 0)")
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
      }
    }
  } finally {
    await db.delete(customsDocuments).where(eq(customsDocuments.id, record.id))
    await pool.end()
  }
})
