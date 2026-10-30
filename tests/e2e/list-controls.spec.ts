import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"

test.use({ storageState: ADMIN_STATE_FILE })

test("filter kustom umum mendukung AND/OR, chip, refresh dan grouping", async ({ page }) => {
  await page.goto("/master/partner?q=kontrol-filter&page=2")
  await page.getByRole("button", { name: "Filter dan kelompokkan", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Favorit", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Tambah filter kustom", exact: true }).click()
  await page.getByLabel("Nilai kondisi 1", { exact: true }).fill("Baja")
  await page.getByRole("button", { name: "Tambah kondisi", exact: true }).click()
  await page.getByLabel("Field kondisi 2", { exact: true }).click()
  await page.getByRole("option", { name: "Negara", exact: true }).click()
  await page.getByLabel("Nilai kondisi 2", { exact: true }).fill("ID")
  await page.getByLabel("Cocokkan kondisi", { exact: true }).click()
  await page.getByRole("option", { name: "Salah satu kondisi terpenuhi (OR)", exact: true }).click()
  await page.getByRole("button", { name: "Terapkan", exact: true }).click()
  await expect(page).not.toHaveURL(/page=/)
  await expect(
    page.getByRole("button", { name: "Hapus OR · Nama mengandung Baja", exact: true }),
  ).toBeVisible()
  let url = new URL(page.url())
  expect(url.searchParams.get("q")).toBe("kontrol-filter")
  expect(JSON.parse(url.searchParams.get("filter")!)).toMatchObject({
    match: "any",
    conditions: [
      { field: "name", value: "Baja" },
      { field: "country", value: "ID" },
    ],
  })
  await page.reload()
  await page.getByRole("button", { name: "Hapus OR · Nama mengandung Baja", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Hapus OR · Negara mengandung ID", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Filter dan kelompokkan", exact: true }).click()
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Kelompokkan", exact: true }) })
    .getByRole("button", { name: "Negara", exact: true })
    .click()
  await expect(
    page.getByRole("button", { name: "Hapus Kelompok: Negara", exact: true }),
  ).toBeVisible()
  url = new URL(page.url())
  expect(url.searchParams.get("kelompok")).toBe("country")
  expect(JSON.parse(url.searchParams.get("filter")!).conditions).toHaveLength(1)
})

test("editor filter tetap muat di desktop dan HP, batal tidak menerapkan draft", async ({
  page,
}) => {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/master/satuan")
    await page.getByRole("button", { name: "Filter dan kelompokkan", exact: true }).click()
    await page.getByRole("button", { name: "Tambah filter kustom", exact: true }).click()
    await page.getByLabel("Field kondisi 1", { exact: true }).click()
    await page.getByRole("option", { name: "Faktor konversi", exact: true }).click()
    await page.getByLabel("Operator kondisi 1", { exact: true }).click()
    await page.getByRole("option", { name: "di antara", exact: true }).click()
    await page.getByLabel("Nilai kondisi 1", { exact: true }).fill("1")
    await page.getByLabel("Nilai akhir kondisi 1", { exact: true }).fill("100")
    await page.getByRole("button", { name: "Terapkan", exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole("button", { name: "Terapkan", exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole("button", { name: "Batal", exact: true }).click()
    await expect(page).not.toHaveURL(/filter=/)
    await page.keyboard.press("Escape")
  }
})

test("filter URL tidak valid terlihat dan dapat dihapus tanpa memperluas hasil diam-diam", async ({
  page,
}) => {
  await page.goto(`/master/partner?filter=${encodeURIComponent("{")}`)
  await expect(
    page.getByRole("alert").filter({ hasText: "Filter kustom tidak valid" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Hapus Filter tidak valid", exact: true }).click()
  await expect(page).not.toHaveURL(/filter=/)
})
