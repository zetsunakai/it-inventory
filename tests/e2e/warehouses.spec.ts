import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Gudang dan lokasi (backlog M1-03): Administrator mengelola gudang, lokasi, dan akses;
// Admin gudang hanya melihat gudang yang diberikan. Berurutan karena saling bergantung data.
test.describe.configure({ mode: "serial" })

// Kode unik per run, karena di CI tes bisa diulang tanpa reset database.
const run = Date.now().toString(36).slice(-4).toUpperCase()
const GRANTED = `GA${run}`
const OTHER = `GB${run}`
let otherWarehouseUrl = ""

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("membuat gudang berikat, lokasi bertingkat, dan memberi akses", async ({ page }) => {
    await page.goto("/master/gudang/baru")
    await page.getByLabel("Kode gudang").fill(GRANTED)
    await page.getByLabel("Nama gudang").fill("Gudang Bahan Baku E2E")
    await page.getByLabel("Alamat").fill("Kawasan Industri, Bekasi")
    await page.getByLabel("Kategori").click()
    await page.getByRole("option", { name: "Bahan baku" }).click()
    await page.getByRole("checkbox", { name: "Gudang berikat" }).check()
    await page.getByRole("button", { name: "Simpan" }).click()

    // Lanjut ke halaman detail gudang yang baru.
    await expect(
      page.getByRole("heading", { name: `${GRANTED} · Gudang Bahan Baku E2E` }),
    ).toBeVisible()
    // Pertama = deskripsi di header (label checkbox di form ubah ada di bawah).
    await expect(page.getByText("Gudang berikat", { exact: true }).first()).toBeVisible()

    const addLocation = page.locator("form").filter({ hasText: "Tambah lokasi" })
    await addLocation.getByLabel("Kode lokasi").fill(`${GRANTED}-RAK`)
    await addLocation.getByLabel("Nama lokasi").fill("Rak A")
    await addLocation.getByRole("button", { name: "Tambah lokasi" }).click()
    await expect(page.getByRole("row").filter({ hasText: "Rak A" })).toContainText(`${GRANTED}-RAK`)

    await addLocation.getByLabel("Kode lokasi").fill(`${GRANTED}-BIN`)
    await addLocation.getByLabel("Nama lokasi").fill("Bin 1")
    await addLocation.getByLabel("Lokasi induk").click()
    await page.getByRole("option", { name: `${GRANTED}-RAK`, exact: true }).click()
    await addLocation.getByRole("button", { name: "Tambah lokasi" }).click()
    await expect(page.getByRole("cell", { name: `${GRANTED}-RAK/${GRANTED}-BIN` })).toBeVisible()

    await page.getByLabel("Beri akses ke").click()
    await page.getByRole("option", { name: /^Demo Admin Gudang/ }).click()
    await page.getByRole("button", { name: "Beri akses" }).click()
    await expect(page.getByRole("button", { name: "Cabut akses Demo Admin Gudang" })).toBeVisible()

    // Gudang kedua tanpa akses untuk Admin gudang.
    await page.goto("/master/gudang/baru")
    await page.getByLabel("Kode gudang").fill(OTHER)
    await page.getByLabel("Nama gudang").fill("Gudang Lain E2E")
    await page.getByLabel("Alamat").fill("Cikarang")
    await page.getByLabel("Kategori").click()
    await page.getByRole("option", { name: "Barang jadi" }).click()
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByRole("heading", { name: `${OTHER} · Gudang Lain E2E` })).toBeVisible()
    otherWarehouseUrl = page.url()
  })
})

test("Admin gudang hanya melihat gudang yang diberikan aksesnya", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.gudang)
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/master/gudang")
  await expect(page.getByRole("link", { name: GRANTED })).toBeVisible()
  await expect(page.getByRole("link", { name: OTHER })).toHaveCount(0)
  // Lokasi virtual hasil seed tampil untuk semua.
  await expect(page.getByRole("cell", { name: "PENYESUAIAN", exact: true })).toBeVisible()

  // Tanpa tombol ubah untuk peran selain Administrator.
  await page.getByRole("link", { name: GRANTED }).click()
  await expect(page.getByRole("cell", { name: `${GRANTED}-RAK/${GRANTED}-BIN` })).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0)

  // Gudang tanpa akses diperlakukan seperti tidak ada.
  await page.goto(otherWarehouseUrl)
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible()
})
