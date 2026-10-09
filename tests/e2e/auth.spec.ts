import { readFileSync } from "node:fs"

import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_TOTP_FILE } from "./accounts"
import { login } from "./login"
import { totp } from "./totp"

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
  await expect(page.getByText(`Selamat datang, ${ACCOUNTS.auditor.name}.`)).toBeVisible()

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

test("Manajer tanpa MFA diarahkan ke halaman aktivasi MFA", async ({ page }) => {
  await page.goto("/login")
  await login(page, ACCOUNTS.manajer)

  await expect(page).toHaveURL(/\/akun\/mfa$/)
  await expect(page.getByText("Verifikasi dua langkah (MFA)")).toBeVisible()

  // Halaman lain tetap tertutup sampai MFA aktif.
  await page.goto("/admin/users")
  await expect(page).toHaveURL(/\/akun\/mfa$/)
})

test("user dengan MFA aktif wajib memasukkan kode TOTP saat login", async ({ page }) => {
  const secret = readFileSync(ADMIN_TOTP_FILE, "utf8")
  await page.goto("/login")
  await login(page, ACCOUNTS.admin)
  await expect(page).toHaveURL(/\/login\/verifikasi/)

  // Kode salah ditolak, sesi belum diberikan.
  await page.getByLabel("Kode autentikasi").fill(totp(secret, Date.now() - 10 * 60_000))
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "Kode salah atau kedaluwarsa" }),
  ).toBeVisible()

  await page.getByLabel("Kode autentikasi").fill(totp(secret))
  await page.getByRole("button", { name: "Verifikasi" }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(`Selamat datang, ${ACCOUNTS.admin.name}.`)).toBeVisible()
})
