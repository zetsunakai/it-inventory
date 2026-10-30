import { expect, test } from "@playwright/test"

import { ADMIN_STATE_FILE } from "../../shared/e2e/accounts"

// Database tes kosong; jangan menghubungkan akun setelah kredensial disimpan.
test.describe.configure({ mode: "serial" })
test.use({ storageState: ADMIN_STATE_FILE })

test("mode baca: Edit dan Hubungkan di atas form, tanpa tombol Simpan per bagian", async ({
  page,
}) => {
  await page.goto("/admin/pengaturan")
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Simpan", exact: true })).toHaveCount(0)
  const section = page.getByRole("group", { name: "Integrasi CEISA" })
  await expect(section.getByText("Production", { exact: true })).toBeVisible()
  await expect(section.getByRole("button")).toHaveCount(0)
  await page.getByRole("button", { name: "Hubungkan", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  await expect(dialog.getByRole("heading", { name: "Kredensial CEISA belum diatur" })).toBeVisible()
  await dialog.getByRole("button", { name: "Tutup" }).click()
  await expect(section.getByText("Gagal terhubung")).toBeVisible()
})

test("Edit menyimpan seluruh pengaturan; Buang membuang draft dan rahasia tidak dimuat ulang", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto("/admin/pengaturan")
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByRole("button", { name: "Simpan", exact: true })).toHaveCount(1)
  await expect(page.getByRole("button", { name: "Hubungkan", exact: true })).toHaveCount(0)
  await page.getByLabel("Username CEISA").fill("draft-dibuang")
  await page.getByRole("button", { name: "Buang", exact: true }).click()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByLabel("Username CEISA")).toHaveValue("")
  await page.getByLabel("Username CEISA").fill("akun-ceisa-tes")
  await page.getByLabel("Password CEISA", { exact: true }).fill("password-ceisa-tes")
  await expect(page.getByLabel("Bea Cukai API key")).not.toHaveAttribute("required")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByLabel("Password CEISA", { exact: true })).toHaveValue("")
  await page.getByRole("button", { name: "Tampilkan password CEISA", exact: true }).click()
  await expect(page.getByLabel("Password CEISA", { exact: true })).toHaveValue("password-ceisa-tes")
  await expect(page.getByLabel("Password CEISA", { exact: true })).toHaveAttribute("type", "text")
  await page.getByRole("button", { name: "Sembunyikan password CEISA", exact: true }).click()
  await expect(page.getByLabel("Password CEISA", { exact: true })).toHaveAttribute(
    "type",
    "password",
  )
  await page.getByLabel("Password CEISA", { exact: true }).fill("")
  await expect(page.getByText("Pengaturan disimpan.", { exact: true })).toHaveCount(0)
  await page.getByLabel("Bea Cukai API key").fill("api-key-tes")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await expect(page.getByLabel("Bea Cukai API key")).toHaveValue("")
  await expect(page.getByText(/API key sudah tersimpan/)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath("ceisa-desktop.png"), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath("ceisa-mobile.png"), fullPage: true })
  await page.getByLabel("Username CEISA").focus()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel("Password CEISA", { exact: true })).toBeFocused()
  await page.getByLabel("Username CEISA").fill("akun-lain")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Periksa isian berikut:" })).toContainText(
    "Password CEISA wajib diisi",
  )
  await page.getByLabel("Password CEISA", { exact: true }).fill("tetap-di-form")
  await page.getByLabel("Username CEISA").fill("")
  await page.getByRole("button", { name: "Simpan", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Periksa isian berikut:" })).toContainText(
    "Username CEISA wajib diisi",
  )
  await expect(page.getByLabel("Password CEISA", { exact: true })).toHaveValue("tetap-di-form")
})
