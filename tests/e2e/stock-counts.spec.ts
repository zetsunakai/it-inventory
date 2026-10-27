import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture, receiveStock, stockAt } from "./fixtures"
import { fillInteractive, waitInteractive } from "./interactive"

// Stock opname dengan pembekuan gudang (backlog M2-09, R-13): Draft → mulai hitung (gudang
// dibekukan) → hitung lewat scan SKU → selesai hitung → ajukan → setujui → penyesuaian.

test.use({ storageState: ADMIN_STATE_FILE })

test("selisih opname yang disetujui tercatat sebagai penyesuaian; gudang beku selama opname", async ({
  page,
}) => {
  const fixture = await createInventoryFixture("OPN")
  await receiveStock(fixture, "10")
  const pendingReceipt = await receiveStock(fixture, "1", undefined, false)

  await page.goto("/inventory/opname/baru")
  await waitInteractive(page.getByLabel("Gudang"))
  await page.getByLabel("Gudang").click()
  await page.getByRole("option", { name: new RegExp(fixture.warehouse.code) }).click()
  await page.getByRole("button", { name: "Buat", exact: true }).click()
  await expect(page.getByRole("heading", { name: /^Stock opname OPN\// })).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Status", exact: true }).locator('[aria-current="step"]'),
  ).toHaveText("Draft")
  const countUrl = page.url()

  await page.getByRole("button", { name: "Mulai hitung" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Mulai hitung" }).click()
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: /^Penghitungan dimulai\. Gudang dibekukan/, visible: true }),
  ).toBeVisible()
  await expect(page.getByText(`Gudang ${fixture.warehouse.code} dibekukan`)).toBeVisible()

  // Transfer di gudang beku tidak bisa divalidasi.
  await page.goto(`/inventory/penerimaan/${pendingReceipt}`)
  await page.getByRole("button", { name: "Konfirmasi" }).click()
  await page.getByRole("button", { name: "Validasi" }).click()
  // Qty selesai mulai kosong (I-01): isi semua qty diminta.
  await page.getByRole("alertdialog").getByRole("button", { name: "Isi semua" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Validasi" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "sedang dibekukan" })).toContainText(
    `Gudang ${fixture.warehouse.code} sedang dibekukan untuk stock opname OPN/`,
  )
  await page.goto(countUrl)

  // Qty sistem tidak tampil selama penghitungan.
  await expect(page.getByText("Qty sistem")).toHaveCount(0)
  const scan = page.getByLabel("Scan atau ketik product code")
  await fillInteractive(scan, fixture.product.sku)
  await scan.press("Enter")
  const qty = page.getByLabel(new RegExp(`^Qty fisik ${fixture.product.sku}`))
  await expect(qty).toBeFocused()
  await qty.fill("8")
  await qty.press("Enter")
  await expect(scan).toBeFocused()
  await expect(page.getByLabel("Tersimpan")).toBeVisible()
  await expect(page.getByText("1 dari 1")).toBeVisible()

  await page.getByRole("button", { name: "Selesai hitung" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Selesai hitung" }).click()
  await expect(
    page.getByText("Selesai hitung", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible()
  await expect(page.getByText("1 dari 1 baris berselisih.")).toBeVisible()
  await expect(page.getByRole("row").filter({ hasText: fixture.product.sku })).toContainText(
    "−2 PCS",
  )

  await page.getByRole("button", { name: "Ajukan persetujuan" }).click()
  // Kartu status (timeline langkah); teks yang sama juga ada di panel Aktivitas.
  await expect(
    page.getByRole("region", { name: "Status" }).locator('[aria-current="step"]'),
  ).toContainText("Menunggu persetujuan")

  await page.getByRole("button", { name: "Setujui hasil opname" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Setujui" }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Selisih tercatat sebagai penyesuaian" }),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: /^ADJ\// })).toBeVisible()
  await expect(page.getByText(`Gudang ${fixture.warehouse.code} dibekukan`)).toHaveCount(0)

  expect(await stockAt(fixture.product.id, fixture.rack.id)).toBe(8)
})
