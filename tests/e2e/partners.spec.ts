import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Partner (backlog M1-06, revisi RM-03): NITKU otomatis dari NPWP, tanpa kode dan peran.
// Berurutan karena tes Auditor membaca partner yang dibuat tes Administrator.
test.describe.configure({ mode: "serial" })

// Nama dan NPWP unik per run, karena di CI tes bisa diulang tanpa reset database.
const run = Date.now().toString().slice(-6)
const VENDOR = `PT Pemasok E2E ${run}`
const NPWP15 = `01.234.567.8-${run.slice(0, 3)}.${run.slice(3)}`
const NPWP15_DIGITS = NPWP15.replace(/\D/g, "")

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("form menampilkan semua kesalahan sekaligus", async ({ page }) => {
    await page.goto("/master/partner/baru")
    await page.getByLabel("Jenis identitas").click()
    await page.getByRole("option", { name: "NPWP 16 digit" }).click()
    await page.getByLabel("NPWP", { exact: true }).fill("123")
    await page.getByRole("button", { name: "Simpan" }).click()

    const errors = page.getByRole("alert").filter({ hasText: "wajib diisi" })
    for (const message of ["Nama partner wajib diisi.", "NPWP harus 16 digit."]) {
      await expect(errors).toContainText(message)
    }
  })

  test("NPWP 15 digit mendapat NITKU 0 + NPWP + 000000; panjang NPWP dibatasi", async ({
    page,
  }) => {
    await page.goto("/master/partner/baru")
    await page.getByLabel("Nama partner").fill(VENDOR)
    await page.getByLabel("Alamat").fill("Kawasan Industri, Bekasi")
    await expect(page.getByLabel("Negara")).toHaveValue("[ID] Indonesia")
    await page.getByLabel("Jenis identitas").click()
    await page.getByRole("option", { name: "NPWP 15 digit" }).click()
    await page.getByLabel("NPWP", { exact: true }).fill(`${NPWP15}999`)
    await expect(page.getByLabel("NPWP", { exact: true })).toHaveValue(NPWP15)
    await expect(page.getByLabel("NITKU")).toHaveAttribute("placeholder", `0${NPWP15_DIGITS}000000`)
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page.getByRole("heading", { name: VENDOR })).toBeVisible()
    await page.goto(`/master/partner?q=${NPWP15_DIGITS}`)
    const row = page.getByRole("row").filter({ hasText: VENDOR })
    await expect(row).toContainText(NPWP15_DIGITS)
    await expect(row).toContainText(`0${NPWP15_DIGITS}000000`)
  })

  test("partner luar negeri dengan paspor, tanpa NITKU", async ({ page }) => {
    const name = `Tanaka Trading ${run}`
    await page.goto("/master/partner/baru")
    await page.getByLabel("Nama partner").fill(name)
    await page.getByLabel("Alamat").fill("Osaka")
    await page.getByLabel("Negara").fill("jepang")
    await page.getByRole("option", { name: "[JP] Jepang" }).click()
    await page.getByLabel("Jenis identitas").click()
    await page.getByRole("option", { name: "Paspor" }).click()
    await expect(page.getByLabel("NITKU")).toHaveCount(0)
    await page.getByLabel("NPWP", { exact: true }).fill("tk 1234567")
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page.getByRole("heading", { name })).toBeVisible()
    await expect(page.getByText("Paspor TK1234567")).toBeVisible()
  })
})

test("Auditor melihat detail partner tanpa form ubah", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/master/partner?q=${NPWP15_DIGITS}`)
  await expect(page.getByRole("link", { name: "Tambah partner" })).toHaveCount(0)
  await page.getByRole("link", { name: VENDOR }).click()
  await expect(page.getByText(`0${NPWP15_DIGITS}000000`)).toBeVisible()
  await expect(page.getByText("[ID] Indonesia")).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0)
})
