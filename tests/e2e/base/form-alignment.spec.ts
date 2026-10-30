import { expect, test, type Page, type Locator } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"
import { createInventoryFixture } from "../inventory/fixtures"

test.use({ storageState: ADMIN_STATE_FILE })

// Kotak visual combobox mencakup input dan tombol dropdown di InputGroup.
async function controlBox(locator: Locator) {
  return locator.evaluate((element) => {
    const control = element.closest('[data-slot="input-group"]') ?? element
    const { x, y, width } = control.getBoundingClientRect()
    return { x, y, width }
  })
}

// Bandingkan kotak kontrol, bukan tinggi field: hint/error boleh menambah tinggi baris.
async function expectAlignedPairs(page: Page, pairs: [string, string][], mobile: boolean) {
  let columns: { left: number; right: number; width: number } | undefined
  for (const [leftLabel, rightLabel] of pairs) {
    const leftControl = page.getByLabel(leftLabel, { exact: true })
    const rightControl = page.getByLabel(rightLabel, { exact: true })
    await expect(leftControl).toBeVisible()
    await expect(rightControl).toBeVisible()
    const left = await controlBox(leftControl)
    const right = await controlBox(rightControl)
    expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(2)
    if (mobile) {
      expect(Math.abs(left.x - right.x)).toBeLessThanOrEqual(1)
      expect(right.y).toBeGreaterThan(left.y)
    } else {
      expect(Math.abs(left.y - right.y)).toBeLessThanOrEqual(2)
      expect(right.x).toBeGreaterThan(left.x + left.width)
      columns ??= { left: left.x, right: right.x, width: left.width }
      expect(Math.abs(left.x - columns.left)).toBeLessThanOrEqual(1)
      expect(Math.abs(right.x - columns.right)).toBeLessThanOrEqual(1)
      expect(Math.abs(left.width - columns.width)).toBeLessThanOrEqual(2)
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test("kolom form satuan dan master sejajar antarbaris di desktop, tablet, dan mobile", async ({
  page,
}, testInfo) => {
  const forms: { name: string; path: string; pairs: [string, string][] }[] = [
    {
      name: "satuan",
      path: "/master/satuan/baru",
      pairs: [
        ["Khusus produk", "Kategori"],
        ["Kode satuan", "Nama satuan"],
        ["Faktor konversi", "Pembulatan"],
      ],
    },
    {
      name: "kategori",
      path: "/master/kategori-produk/baru",
      pairs: [
        ["Nama kategori", "Kategori induk"],
        ["Prefix kode", "Jumlah digit"],
      ],
    },
    {
      name: "produk",
      path: "/master/produk/baru",
      pairs: [
        ["Nama produk", "Satuan stok"],
        ["Product code", "Kategori produk"],
        ["Kategori IT Inventory", "Merk"],
        ["Tipe", "Ukuran"],
      ],
    },
    {
      name: "partner",
      path: "/master/partner/baru",
      pairs: [
        ["Alamat", "Negara"],
        ["Jenis identitas", "NPWP"],
      ],
    },
    { name: "referensi", path: "/master/referensi/tps/baru", pairs: [["Kode", "Nama"]] },
    { name: "gudang", path: "/master/gudang/baru", pairs: [["Kode gudang", "Nama gudang"]] },
  ]
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const form of forms) {
      await page.goto(form.path)
      await expectAlignedPairs(page, form.pairs, width < 768)
      await page.screenshot({
        path: testInfo.outputPath(`${form.name}-${width}.png`),
        fullPage: true,
      })
    }
  }
})

test("lokasi baru diedit di tabel dan Buang membatalkan seluruh baris draft", async ({ page }) => {
  const fixture = await createInventoryFixture("ALIGN")
  await page.goto(`/master/gudang/${fixture.warehouse.id}`)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  const table = page.locator('[data-relational-table="warehouse-locations"]')
  await table.getByRole("button", { name: "Tambah lokasi", exact: true }).click()
  const code = table.getByLabel("Kode lokasi baris 3", { exact: true })
  await expect(code).toBeFocused()
  await code.fill("BELUM-DISIMPAN")
  await table.getByLabel("Nama lokasi baris 3", { exact: true }).fill("Lokasi draft")
  await page.getByRole("button", { name: "Buang", exact: true }).click()
  await expect(page.getByText("BELUM-DISIMPAN", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByText("BELUM-DISIMPAN", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Simpan", exact: true })).toHaveCount(1)
})
