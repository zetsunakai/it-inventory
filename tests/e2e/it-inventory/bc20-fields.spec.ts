import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"

test.use({ storageState: ADMIN_STATE_FILE })

test("field tambahan BC 2.0 tersedia di form desktop dan HP", async ({ page }) => {
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/dokumen-bc/bc20/baru")
    await page.getByRole("tab", { name: "Entitas", exact: true }).click()
    for (const label of [
      "NIB importir",
      "Negara importir",
      "Negara pemilik",
      "Negara pemusatan",
      "Jenis identitas PPJK",
      "Nomor identitas PPJK",
      "Nama PPJK",
      "Alamat PPJK",
      "Negara PPJK",
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible()
    }
    await page.getByLabel("NIB importir", { exact: true }).fill("1234567890123")
    await page.getByRole("tab", { name: "Transaksi", exact: true }).click()
    await page.getByLabel("Menggunakan Voluntary Declaration", { exact: true }).click()
    await page.getByRole("option", { name: "[T] Tidak", exact: true }).click()
    await expect(page.locator('[data-relational-table="bc-Bank devisa"]')).toBeVisible()
    await page.getByRole("tab", { name: "Pungutan", exact: true }).click()
    const taxes = page.locator('[data-relational-table="bc-Pungutan"]')
    await expect(
      taxes.getByRole("columnheader", { name: "Nilai Pungutan", exact: true }),
    ).toBeVisible()
    for (const label of ["Jenis Pungutan", "Tarif", "Status"]) {
      await expect(taxes.getByRole("columnheader", { name: label, exact: true })).toHaveCount(0)
    }
    await expect(taxes.locator("tfoot")).toHaveCount(0)
    for (const label of [
      "Dibayar",
      "Ditanggung Pemerintah",
      "Ditunda",
      "Tidak Dipungut",
      "Dibebaskan",
      "Sudah Dilunasi",
    ]) {
      await expect(page.getByRole("columnheader", { name: label, exact: true })).toBeVisible()
    }
    await page.getByRole("tab", { name: "Pernyataan", exact: true }).click()
    await page.getByLabel("Setuju pengiriman dokumen", { exact: true }).click()
    await page.getByRole("option", { name: "[0] Tidak", exact: true }).click()
    const payload = JSON.parse(await page.locator('input[name="document"]').inputValue())
    expect(payload.details).toMatchObject({ disclaimer: "0", voluntaryDeclarationFlag: "T" })
    expect(
      payload.parties.find((party: { entityTypeCode: string }) => party.entityTypeCode === "1").nib,
    ).toBe("1234567890123")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
