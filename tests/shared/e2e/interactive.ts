import { expect, type Locator, type Page } from "@playwright/test"

// Isi input setelah React selesai hidrasi. Input hasil SSR sudah terlihat sebelum event handler
// terpasang; bila langsung diketik (terutama saat server sedang sibuk), ketikan tidak memicu
// pencarian di komponen seperti SearchSelect. React menempelkan props-nya ke elemen DOM saat
// hidrasi, jadi itu tanda input sudah interaktif.
export async function waitInteractive(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true)
}

export async function fillInteractive(locator: Locator, value: string) {
  await waitInteractive(locator)
  await locator.fill(value)
}

// Status berpindah ke panel pada area dokumen sempit; tetap periksa state aktif yang terlihat.
export async function expectDocumentStatus(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: "Tampilkan status", exact: true })
  const region = page.getByRole("region", { name: "Status", exact: true })
  await expect(region.or(toggle).first()).toBeVisible()
  const compact = await toggle.isVisible()
  if (compact) {
    await waitInteractive(toggle)
    await toggle.click()
  }
  await expect(
    page.getByRole("region", { name: "Status", exact: true }).locator('[aria-current="step"]'),
  ).toHaveText(label)
  if (compact)
    await page.getByRole("dialog").getByRole("button", { name: "Tutup", exact: true }).click()
}

export async function openEditableRow(page: Page, id = "transfer-lines", index = 1) {
  const table = page.locator(`[data-relational-table="${id}"]`).filter({ visible: true })
  const row = table
    .locator("tbody > tr:has(> [data-relation-column])")
    .filter({ visible: true })
    .nth(index - 1)
  await waitInteractive(row)
  await row.locator("td").nth(1).click()
}
