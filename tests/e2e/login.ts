import type { Page } from "@playwright/test"

// Isi form login di halaman yang sedang terbuka (biasanya /login atau redirect ke sana).
export async function login(page: Page, account: { email: string; password: string }) {
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Masuk" }).click()
}
