import { expect, test, type Page } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, stockAt } from "./fixtures"
import { fillInteractive, openEditableRow } from "./interactive"

// Penerimaan (backlog M2-03, M2-05): Draft → Siap → Selesai menambah saldo di lokasi tujuan;
// qty yang belum datang menjadi penerimaan lanjutan.

test.use({ storageState: ADMIN_STATE_FILE })

type Fixture = Awaited<ReturnType<typeof createInventoryFixture>>

// Status masuk panel samping saat area dokumen sempit, termasuk viewport default tes.
async function expectDocumentStatus(page: Page, label: string) {
  const toggle = page.getByRole("button", { name: "Tampilkan status", exact: true })
  const inPanel = await toggle.isVisible()
  if (inPanel) await toggle.click()
  await expect(
    page.getByRole("region", { name: "Status", exact: true }).locator('[aria-current="step"]'),
  ).toHaveText(label)
  if (inPanel) await page.getByRole("dialog").getByRole("button", { name: "Tutup" }).click()
}

async function createReadyReceipt(page: Page, fixture: Fixture, qty: string) {
  await page.goto("/inventory/penerimaan")
  await page.getByRole("link", { name: "Buat", exact: true }).first().click()
  await fillInteractive(page.getByLabel("Vendor", { exact: true }), fixture.partner.code)
  await page.getByRole("option", { name: new RegExp(fixture.partner.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(fixture.rack.code) }).click()
  await page.getByLabel("Referensi PO/SO").fill("PO-E2E-1")
  await openEditableRow(page)
  await fillInteractive(page.getByLabel("Produk baris 1"), fixture.product.sku)
  await page.getByRole("option", { name: new RegExp(fixture.product.sku) }).click()
  await page.getByLabel("Qty baris 1").fill(qty)
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page).toHaveURL(/\/inventory\/penerimaan\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("heading", { name: /^Penerimaan PNR\// })).toBeVisible()
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Transfer dikonfirmasi." })).toBeVisible()
}

test("penerimaan dari vendor divalidasi dan menambah stok", async ({ page }) => {
  const fixture = await createInventoryFixture("RCV")
  await createReadyReceipt(page, fixture, "12,5")

  await page.getByRole("button", { name: "Validasi" }).click()
  // Qty selesai mulai kosong (I-01): isi semua qty diminta.
  await page.getByRole("alertdialog").getByRole("button", { name: "Isi semua" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
  await expectDocumentStatus(page, "Selesai")
  await expect(page.getByRole("button", { name: "Batalkan penerimaan" })).toHaveCount(0)

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(12.5)

  await page.goto(`/inventory/penerimaan?q=${encodeURIComponent(fixture.partner.name)}`)
  await expect(page.getByRole("row").filter({ hasText: fixture.partner.name })).toContainText(
    "Selesai",
  )
})

test("penerimaan parsial: sisa qty menjadi penerimaan lanjutan", async ({ page }) => {
  const fixture = await createInventoryFixture("BCK")
  await createReadyReceipt(page, fixture, "10")

  await page.getByRole("button", { name: "Validasi" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByLabel(fixture.product.sku).fill("6")
  // Default: sisa qty jadi penerimaan lanjutan (R-08).
  await expect(dialog.getByLabel("Buat penerimaan lanjutan (Draft) untuk sisanya")).toBeChecked()
  await dialog.getByRole("button", { name: "Validasi" }).click()

  const link = page.getByRole("link", { name: /^penerimaan lanjutan PNR\// })
  await expect(link).toBeVisible()
  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(6)

  await link.click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expectDocumentStatus(page, "Draft")
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await openEditableRow(page)
  await expect(page.getByLabel("Qty baris 1").filter({ visible: true })).toHaveValue("4")
})

test("penerimaan parsial: sisa qty dibuang tanpa penerimaan lanjutan", async ({ page }) => {
  const fixture = await createInventoryFixture("DSC")
  await createReadyReceipt(page, fixture, "10")

  await page.getByRole("button", { name: "Validasi" }).click()
  const dialog = page.getByRole("alertdialog")
  await dialog.getByLabel(fixture.product.sku).fill("7")
  await dialog.getByLabel("Buang sisa, tidak ada transfer lanjutan").check()
  await dialog.getByRole("button", { name: "Validasi" }).click()

  await expect(
    page.getByRole("status").filter({ hasText: "Transfer divalidasi. Stok sudah diperbarui." }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /^penerimaan lanjutan PNR\// })).toHaveCount(0)
  await expect(page.getByText("Sisa dibuang")).toBeVisible()
  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(7)
})
