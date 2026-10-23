import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { createDb } from "@/server/db/client"
import { products, uoms } from "@/server/db/schema"
import { insertCompleteDocument } from "../db/customs-fixtures"
import { TEST_DATABASE_URL } from "../test-env"
import { ADMIN_STATE_FILE } from "./accounts"
import { createInventoryFixture } from "./fixtures"
import { fillInteractive } from "./interactive"

test.use({ storageState: ADMIN_STATE_FILE })

const table = (page: Page) =>
  page.locator('[data-relational-table="transfer-lines"]').filter({ visible: true })
const payload = (page: Page) =>
  page
    .locator('input[name="lines"]')
    .filter({ visible: false })
    .last()
    .inputValue()
    .then((value) => JSON.parse(value) as { productId: string; inputQty: string }[])

async function chooseProduct(page: Page, index: number, sku: string) {
  await fillInteractive(page.getByLabel(`Produk baris ${index}`), sku)
  await page.getByRole("option", { name: new RegExp(sku) }).click()
}

test("edit, sort, pencarian, hapus, dan simpan menjaga identitas baris", async ({ page }) => {
  const first = await createInventoryFixture("RELZ")
  const second = await createInventoryFixture("RELA")
  await page.goto("/inventory/penerimaan/baru")
  await fillInteractive(page.getByLabel("Vendor", { exact: true }), first.partner.code)
  await page.getByRole("option", { name: new RegExp(first.partner.code) }).click()
  await page.getByLabel("Lokasi tujuan").click()
  await page.getByRole("option", { name: new RegExp(first.rack.code) }).click()
  await chooseProduct(page, 1, first.product.sku)
  await page.getByLabel("Qty baris 1").fill("0,1")
  await table(page).getByRole("button", { name: "Tambah baris", exact: true }).click()
  await chooseProduct(page, 2, second.product.sku)
  await page.getByLabel("Qty baris 2").fill("0,2")
  await expect(table(page).locator("tfoot")).toContainText("0,3 PCS")

  await table(page).getByTitle("Urutkan Produk", { exact: true }).click()
  await expect(table(page).locator("tbody > tr").filter({ visible: true }).first()).toContainText(
    second.product.sku,
  )
  await page.getByLabel("Qty baris 2").fill("0,4")
  expect(await payload(page)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ productId: first.product.id, inputQty: "0,1" }),
      expect.objectContaining({ productId: second.product.id, inputQty: "0,4" }),
    ]),
  )
  await table(page).getByRole("button", { name: "Cari Produk", exact: true }).click()
  await table(page).getByLabel("Pencarian Produk").fill(second.product.sku)
  await expect(table(page).locator("tbody > tr").filter({ visible: true })).toHaveCount(1)
  expect(await payload(page)).toHaveLength(2)
  await table(page).getByRole("button", { name: "Reset pencarian" }).click()
  await table(page).getByRole("button", { name: "Hapus baris 1", exact: true }).click()
  await expect(page.getByLabel("Qty baris 1")).toHaveValue("0,4")
  expect((await payload(page))[0].productId).toBe(second.product.id)
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page).toHaveURL(/\/inventory\/penerimaan\/[0-9a-f-]{36}$/)
  // Detail Draft dibuka dalam mode baca; Edit membuka form.
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByLabel("Qty baris 1").filter({ visible: true })).toHaveValue("0,4")
  await page.reload()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByLabel("Qty baris 1").filter({ visible: true })).toHaveValue("0,4")
})

test("foreign key menjangkau hasil halaman kedua dan membuka detail record", async ({ page }) => {
  const prefix = `PICK${Date.now().toString(36).toUpperCase()}`
  const { db, pool } = createDb(TEST_DATABASE_URL)
  let choices: { id: string; sku: string }[]
  try {
    const [unit] = await db.select({ id: uoms.id }).from(uoms).where(eq(uoms.code, "PCS"))
    choices = await db
      .insert(products)
      .values(
        Array.from({ length: 25 }, (_, index) => ({
          sku: `${prefix}-${String(index + 1).padStart(2, "0")}`,
          name: `Pilihan ${index + 1}`,
          category: "raw_material" as const,
          uomId: unit.id,
        })),
      )
      .returning({ id: products.id, sku: products.sku })
  } finally {
    await pool.end()
  }
  await page.goto("/inventory/penerimaan/baru")
  await fillInteractive(page.getByLabel("Produk baris 1").filter({ visible: true }), prefix)
  await page.getByRole("button", { name: "Cari lebih lanjut", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Cari lebih lanjut" })
  await expect(dialog.getByRole("button", { name: "Hasil berikutnya" })).toBeEnabled()
  await dialog.getByRole("button", { name: "Hasil berikutnya" }).click()
  await expect(dialog.getByText("Halaman 2 · 5 hasil")).toBeVisible()
  const choice = choices![24]
  await dialog.getByRole("button", { name: new RegExp(`Pilih.*${choice.sku}`) }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel("Produk baris 1").filter({ visible: true })).toHaveValue(
    new RegExp(choice.sku),
  )
  await expect(
    table(page).getByRole("link", { name: new RegExp(`Buka detail.*${choice.sku}`) }),
  ).toHaveAttribute("href", `/master/produk/${choice.id}`)
  expect((await payload(page))[0].productId).toBe(choice.id)
})

test("pagination, preferensi kolom, dan seleksi mempertahankan seluruh payload", async ({
  page,
}) => {
  await page.goto("/inventory/penerimaan/baru")
  for (let index = 0; index < 10; index++)
    await table(page).getByRole("button", { name: "Tambah baris", exact: true }).click()
  await expect(table(page).locator("tbody > tr").filter({ visible: true })).toHaveCount(1)
  await page.getByLabel("Qty baris 11").fill("7")
  await table(page).getByRole("button", { name: "Halaman sebelumnya Barang" }).click()
  await expect(table(page).locator("tbody > tr").filter({ visible: true })).toHaveCount(10)
  expect((await payload(page))[10].inputQty).toBe("7")
  await table(page).getByRole("button", { name: "Halaman berikutnya Barang" }).click()
  await expect(page.getByLabel("Qty baris 11")).toHaveValue("7")
  await table(page).getByRole("button", { name: "Atur kolom Barang" }).click()
  await page.getByRole("menuitemcheckbox", { name: "Nomor lot", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(table(page).getByRole("columnheader").filter({ hasText: "Nomor lot" })).toHaveCount(
    0,
  )
  await table(page).getByRole("checkbox", { name: "Pilih semua Barang" }).check()
  await expect(table(page).getByRole("button", { name: "Hapus terpilih" })).toBeDisabled()
  await page.reload()
  await expect(table(page).getByRole("columnheader").filter({ hasText: "Nomor lot" })).toHaveCount(
    0,
  )
})

test("tabel relasi dan selector terkandung di viewport desktop dan mobile", async ({
  page,
}, testInfo) => {
  await page.goto("/inventory/penerimaan/baru")
  await fillInteractive(page.getByLabel("Qty baris 1"), "10")
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(table(page)).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`relation-${viewport.width}.png`),
      fullPage: true,
    })
  }
  await page.getByLabel("Produk baris 1").click()
  await page.getByRole("button", { name: "Cari lebih lanjut", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Cari lebih lanjut" })
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((element) => element.getBoundingClientRect().width <= window.innerWidth),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("selector-mobile.png"), fullPage: true })
})

test("daftar BC mendukung edit detail, reorder, dan hapus tanpa menukar nilai", async ({
  page,
}, testInfo) => {
  await page.goto("/dokumen-bc/bc23/baru")
  await page.getByRole("tab", { name: "Barang", exact: true }).click()
  const items = page.locator('[data-relational-table="bc-23-barang"]')
  await items.getByRole("button", { name: "Edit baris 1", exact: true }).click()
  await page.getByRole("textbox", { name: "Jumlah dalam Satuan Stok", exact: true }).fill("11")
  await items.getByRole("button", { name: "Tambah Barang", exact: true }).click()
  await page
    .getByRole("textbox", { name: "Jumlah dalam Satuan Stok", exact: true })
    .filter({ visible: true })
    .fill("22")
  const handle = items.getByRole("button", { name: "Urutkan baris 2", exact: true })
  await handle.focus()
  await page.keyboard.press("ArrowUp")
  const docValue = () =>
    page
      .locator('input[name="document"]')
      .inputValue()
      .then((value) => JSON.parse(value) as { lines: { stockQty: string }[] })
  expect((await docValue()).lines.map((line) => line.stockQty)).toEqual(["22", "11"])
  await items.getByRole("button", { name: "Hapus baris 2", exact: true }).click()
  expect((await docValue()).lines.map((line) => line.stockQty)).toEqual(["22"])
  await expect(
    page
      .getByRole("textbox", { name: "Jumlah dalam Satuan Stok", exact: true })
      .filter({ visible: true }),
  ).toHaveValue("22")
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await page.screenshot({ path: testInfo.outputPath("bc-mobile.png"), fullPage: true })
})

test("validasi membuka baris wajib yang tersembunyi oleh filter", async ({ page }) => {
  const fixture = await createInventoryFixture("RVAL")
  await page.goto("/inventory/penerimaan/baru")
  await chooseProduct(page, 1, fixture.product.sku)
  await page.getByLabel("Qty baris 1").fill("1")
  await table(page).getByRole("button", { name: "Tambah baris", exact: true }).click()
  await table(page).getByRole("button", { name: "Selesai baris 2", exact: true }).click()
  await table(page).getByRole("button", { name: "Cari Produk", exact: true }).click()
  await table(page).getByLabel("Pencarian Produk").fill(fixture.product.sku)
  await expect(table(page).locator("tbody > tr").filter({ visible: true })).toHaveCount(1)
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(table(page).getByRole("alert")).toContainText("baris 2")
  await expect(page.getByLabel("Produk baris 2")).toBeVisible()
  await expect(page.getByLabel("Qty baris 2")).toBeVisible()
  expect(await payload(page)).toHaveLength(2)
})

test("barang BC tetap tersimpan saat detail ditutup", async ({ page }) => {
  const fixture = await createInventoryFixture("BCSAVE")
  const { db, pool } = createDb(TEST_DATABASE_URL)
  let documentId: string
  try {
    await db.update(products).set({ hsCode: "52081100" }).where(eq(products.id, fixture.product.id))
    documentId = await db.transaction(
      async (tx) => (await insertCompleteDocument(tx, "23", fixture.product.id)).id,
    )
  } finally {
    await pool.end()
  }
  await page.goto(`/dokumen-bc/bc23/${documentId!}`)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("tab", { name: "Barang", exact: true }).click()
  const items = page.locator('[data-relational-table="bc-23-barang"]')
  await items.getByRole("button", { name: "Edit baris 1", exact: true }).click()
  await page.getByRole("textbox", { name: "Jumlah dalam Satuan Stok", exact: true }).fill("77")
  await items.getByRole("button", { name: "Selesai baris 1", exact: true }).click()
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByText("Dokumen disimpan.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("tab", { name: "Barang", exact: true }).click()
  await expect(
    page
      .locator('[data-relational-table="bc-23-barang"]')
      .locator("tbody > tr")
      .filter({ visible: true })
      .first(),
  ).toContainText("77")
})
