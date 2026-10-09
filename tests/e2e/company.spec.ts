import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Profil perusahaan (backlog M1-02): Administrator mengisi, peran lain hanya melihat.
// Berurutan karena tes kedua membaca data yang disimpan tes pertama.
test.describe.configure({ mode: "serial" })

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("ketikan user tidak hilang saat validasi gagal", async ({ page }) => {
    await page.goto("/master/perusahaan")
    await page.getByLabel("Nama perusahaan").fill("PT Belum Lengkap")
    await page.getByLabel("NPWP").fill("123")
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page.getByText("NPWP harus 15 atau 16 digit.").first()).toBeVisible()
    await expect(page.getByLabel("NPWP")).toHaveValue("123")
    await expect(page.getByLabel("Nama perusahaan")).toHaveValue("PT Belum Lengkap")
  })

  test("mengisi profil perusahaan; NITKU kantor pusat terisi otomatis", async ({ page }) => {
    await page.goto("/master/perusahaan")
    await page.getByLabel("Nama perusahaan").fill("PT Uji E2E Berikat")
    await page.getByLabel("Alamat").fill("Jl. Industri No. 1, Bekasi")
    await page.getByLabel("NPWP").fill("01.234.567.8-901.000")
    await page.getByLabel("NIB").fill("1234567890123")
    await page.getByLabel("NITKU").fill("")
    await page.getByLabel("Jenis fasilitas").click()
    await page.getByRole("option", { name: "Kawasan Berikat (KB)" }).click()
    await page.getByLabel("Kantor pabean pengawas").fill("040300")
    await page.getByRole("option", { name: "[040300] KPU Tanjung Priok" }).click()
    await page.getByLabel("Nomor izin fasilitas").fill("KEP-123/WBC.08/2024")
    await page.getByLabel("Tanggal izin fasilitas").fill("2024-03-15")
    await page.getByRole("button", { name: "Simpan" }).click()

    await expect(page.getByRole("status")).toHaveText("Profil perusahaan disimpan.")

    await page.reload()
    await expect(page.getByLabel("NPWP")).toHaveValue("0012345678901000")
    await expect(page.getByLabel("NITKU")).toHaveValue("0012345678901000000000")
    await expect(page.getByLabel("Kantor pabean pengawas")).toHaveValue(
      "[040300] KPU Tanjung Priok",
    )
  })
})

test("Auditor melihat profil tanpa bisa mengubah", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)
  await expect(page).toHaveURL(/\/$/)

  await page.goto("/master/perusahaan")
  await expect(page.getByText("PT Uji E2E Berikat")).toBeVisible()
  await expect(page.getByText("0012345678901000000000")).toBeVisible()
  await expect(page.getByText("[040300] KPU Tanjung Priok")).toBeVisible()
  await expect(page.getByText("15/03/2024")).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan" })).toHaveCount(0)
})
