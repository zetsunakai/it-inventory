import { writeFileSync } from "node:fs"

import { expect, test as setup } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE, ADMIN_TOTP_FILE } from "./accounts"
import { login } from "./login"
import { totp } from "./totp"

// Dijalankan sekali sebelum tes lain: Administrator login (MFA tidak lagi wajib), lalu
// mengaktifkan MFA secara sukarela supaya alur kode TOTP saat login tetap punya user ber-MFA.
// Sesinya disimpan untuk tes yang butuh akses Administrator.
setup("Administrator login dan mengaktifkan MFA (opsional)", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("button", { name: `Menu akun ${ACCOUNTS.admin.name}` })).toBeVisible()

  await page.goto("/akun/mfa")
  await page.getByLabel("Password akun Anda").fill(ACCOUNTS.admin.password)
  await page.getByRole("button", { name: "Lanjut" }).click()
  const secret = (await page.getByTestId("mfa-manual-key").textContent())?.trim()
  expect(secret).toBeTruthy()

  await page.getByLabel("Kode dari aplikasi").fill(totp(secret!))
  await page.getByRole("button", { name: "Aktifkan MFA" }).click()
  await expect(page.getByText("MFA sudah aktif untuk akun Anda.")).toBeVisible()
  await page.getByRole("link", { name: "Kembali ke beranda" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("button", { name: `Menu akun ${ACCOUNTS.admin.name}` })).toBeVisible()

  writeFileSync(ADMIN_TOTP_FILE, secret!)
  await page.context().storageState({ path: ADMIN_STATE_FILE })
})
