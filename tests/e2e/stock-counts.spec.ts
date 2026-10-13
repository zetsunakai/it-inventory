import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Stock opname (backlog M2-09): hitung lewat scan SKU, ajukan, setujui → penyesuaian.

test.use({ storageState: ADMIN_STATE_FILE })

test("selisih opname yang disetujui tercatat sebagai penyesuaian", async ({ page }) => {
  const fixture = await createInventoryFixture("OPN")
  await receiveStock(fixture, "10")

  await page.goto("/inventory/opname/baru")
  await waitInteractive(page.getByLabel("Gudang"))
  await page.getByLabel("Gudang").click()
  await page.getByRole("option", { name: new RegExp(fixture.warehouse.code) }).click()
  await page.getByRole("button", { name: "Buat sesi opname" }).click()
  await expect(page.getByRole("heading", { name: /^Stock opname OPN\// })).toBeVisible()

  // Qty sistem tidak tampil selama penghitungan.
  await expect(page.getByText("Qty sistem")).toHaveCount(0)
  const scan = page.getByLabel("Scan atau ketik SKU")
  await fillInteractive(scan, fixture.product.sku)
  await scan.press("Enter")
  const qty = page.getByLabel(new RegExp(`^Qty fisik ${fixture.product.sku}`))
  await expect(qty).toBeFocused()
  await qty.fill("8")
  await qty.press("Enter")
  await expect(scan).toBeFocused()
  await expect(page.getByLabel("Tersimpan")).toBeVisible()
  await expect(page.getByText("1 dari 1")).toBeVisible()

  await page.getByRole("button", { name: "Ajukan persetujuan" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Ajukan" }).click()
  await expect(
    page.getByText("Menunggu persetujuan", { exact: true }).filter({ visible: true }),
  ).toBeVisible()
  await expect(page.getByText("1 dari 1 baris berselisih.")).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: fixture.product.sku })).toContainText(
    "−2 PCS",
  )

  await page.getByRole("button", { name: "Setujui hasil opname" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Setujui" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Selisih tercatat sebagai penyesuaian." }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /^ADJ\// })).toBeVisible()

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(8)
})
