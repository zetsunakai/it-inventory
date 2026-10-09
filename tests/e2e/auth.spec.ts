import { expect, test, type Page } from "@playwright/test"

import { ACCOUNTS } from "./accounts"

async function login(page: Page, account: { email: string; password: string }) {
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Masuk" }).click()
}

test("halaman tanpa sesi diarahkan ke login dan menyimpan tujuan awal", async ({ page }) => {
  await page.goto("/admin/users")

  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers$/)
  await expect(page.getByText("Masuk ke IT Inventory")).toBeVisible()
})

test("password salah ditolak tanpa membedakan email terdaftar atau tidak", async ({ page }) => {
  // Next.js juga punya elemen role="alert" (route announcer), jadi saring dengan teksnya.
  const error = page.getByRole("alert").filter({ hasText: "Email atau password salah." })

  for (const email of [ACCOUNTS.auditor.email, "tidak-terdaftar@it-inventory.local"]) {
    await page.goto("/login")
    await login(page, { email, password: "password-yang-salah" })

    await expect(error).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  }
})

test("auditor bisa login lalu logout", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.auditor)

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(ACCOUNTS.auditor.name)).toBeVisible()

  await page.getByRole("button", { name: "Keluar" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await page.goto("/")
  await expect(page).toHaveURL(/\/login$/)
})

test("auditor tidak bisa membuka halaman pengguna", async ({ page }) => {
  await page.goto("/admin/users")
  await login(page, ACCOUNTS.auditor)

  await expect(page).toHaveURL(/\/admin\/users$/)
  await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible()
})

test("Administrator tanpa MFA diarahkan ke halaman aktivasi MFA", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.admin)

  await expect(page).toHaveURL(/\/akun\/mfa$/)
  await expect(page.getByText("Verifikasi dua langkah (MFA)")).toBeVisible()

  // Halaman lain tetap tertutup sampai MFA aktif.
  await page.goto("/admin/users")
  await expect(page).toHaveURL(/\/akun\/mfa$/)
})
